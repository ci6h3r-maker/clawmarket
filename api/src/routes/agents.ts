import { Router, Request, Response } from "express";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import db from "../db";
import { verifySignature, AuthenticatedRequest } from "../middleware/auth";
import {
  buildRegisterAgentTx,
  deriveAgentPda,
  fetchAgentRecord,
} from "../solana/programs";

export const agentRoutes = Router();

// POST /agents/register — Register a bot's Ed25519 keypair
agentRoutes.post(
  "/register",
  verifySignature({ skipRegistrationCheck: true }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { agent_pubkey, wallet, display_name } = req.body;

      if (!wallet) {
        res.status(400).json({ error: "Missing wallet address" });
        return;
      }

      // Validate wallet is a valid Solana pubkey
      let walletPubkey: PublicKey;
      let agentPubkeyObj: PublicKey;
      try {
        walletPubkey = new PublicKey(wallet);
        agentPubkeyObj = new PublicKey(agent_pubkey);
      } catch {
        res.status(400).json({ error: "Invalid pubkey format" });
        return;
      }

      // Validate display_name if provided
      let sanitizedName: string | null = null;
      if (display_name) {
        // Max 32 chars, alphanumeric + underscore only
        if (typeof display_name !== 'string' || display_name.length > 32) {
          res.status(400).json({ error: "Display name must be 32 characters or less" });
          return;
        }
        if (!/^[a-zA-Z0-9_]+$/.test(display_name)) {
          res.status(400).json({ error: "Display name can only contain letters, numbers, and underscores" });
          return;
        }
        // Check if name is taken
        const nameTaken = db
          .prepare("SELECT agent_pubkey FROM agents WHERE display_name = ? COLLATE NOCASE")
          .get(display_name);
        if (nameTaken) {
          res.status(409).json({ error: "Display name already taken" });
          return;
        }
        sanitizedName = display_name;
      }

      // Check if already registered
      const existing = db
        .prepare("SELECT agent_pubkey FROM agents WHERE agent_pubkey = ?")
        .get(agent_pubkey);
      if (existing) {
        res.status(409).json({ error: "Agent already registered" });
        return;
      }

      // Build the on-chain registration transaction
      const tx = await buildRegisterAgentTx(agentPubkeyObj, walletPubkey);
      const serializedTx = tx
        .serialize({ requireAllSignatures: false })
        .toString("base64");

      // Derive PDA for reference
      const [pda] = deriveAgentPda(agentPubkeyObj);

      // Insert into off-chain index
      const now = Math.floor(Date.now() / 1000);
      db.prepare(
        `INSERT INTO agents (agent_pubkey, wallet, registered_at, pda, display_name)
         VALUES (?, ?, ?, ?, ?)`
      ).run(agent_pubkey, wallet, now, pda.toBase58(), sanitizedName);

      res.status(201).json({
        agent_pubkey,
        wallet,
        display_name: sanitizedName,
        pda: pda.toBase58(),
        transaction: serializedTx,
        message:
          "Sign this transaction with your Solana wallet and submit to complete on-chain registration",
      });
    } catch (err: any) {
      console.error("Register agent error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// PATCH /agents/:pubkey — Update agent profile (display_name)
agentRoutes.patch(
  "/:pubkey",
  verifySignature(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { pubkey } = req.params;
      const { display_name } = req.body;

      // Verify the requester owns this agent
      if (req.agentPubkey !== pubkey) {
        res.status(403).json({ error: "Cannot update another agent's profile" });
        return;
      }

      // Validate display_name
      if (display_name !== undefined) {
        if (display_name === null || display_name === '') {
          // Allow clearing the name
          db.prepare("UPDATE agents SET display_name = NULL WHERE agent_pubkey = ?").run(pubkey);
        } else {
          if (typeof display_name !== 'string' || display_name.length > 32) {
            res.status(400).json({ error: "Display name must be 32 characters or less" });
            return;
          }
          if (!/^[a-zA-Z0-9_]+$/.test(display_name)) {
            res.status(400).json({ error: "Display name can only contain letters, numbers, and underscores" });
            return;
          }
          // Check if name is taken by someone else
          const nameTaken = db
            .prepare("SELECT agent_pubkey FROM agents WHERE display_name = ? COLLATE NOCASE AND agent_pubkey != ?")
            .get(display_name, pubkey);
          if (nameTaken) {
            res.status(409).json({ error: "Display name already taken" });
            return;
          }
          db.prepare("UPDATE agents SET display_name = ? WHERE agent_pubkey = ?").run(display_name, pubkey);
        }
      }

      const updated = db.prepare("SELECT * FROM agents WHERE agent_pubkey = ?").get(pubkey) as any;
      res.json({ agent: updated });
    } catch (err: any) {
      console.error("Update agent error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// GET /agents/:pubkey — Get agent profile and stats
agentRoutes.get("/:pubkey", async (req: Request, res: Response) => {
  try {
    const { pubkey } = req.params;

    // Try on-chain first
    let agentPubkey: PublicKey;
    try {
      agentPubkey = new PublicKey(pubkey);
    } catch {
      res.status(400).json({ error: "Invalid pubkey format" });
      return;
    }

    const onChain = await fetchAgentRecord(agentPubkey);

    // Get off-chain data
    const offChain = db
      .prepare("SELECT * FROM agents WHERE agent_pubkey = ?")
      .get(pubkey) as any;

    if (!onChain && !offChain) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    // Get agent's listings
    const listings = db
      .prepare(
        "SELECT id, pda, title, price, active, sales_count, positive_ratings, negative_ratings FROM products WHERE seller_pubkey = ? ORDER BY created_at DESC"
      )
      .all(pubkey);

    // Get agent's jobs (as client)
    const clientJobs = db
      .prepare(
        "SELECT id, pda, title, status, payment FROM jobs WHERE client_pubkey = ? ORDER BY created_at DESC"
      )
      .all(pubkey);

    // Get agent's jobs (as worker)
    const workerJobs = db
      .prepare(
        "SELECT id, pda, title, status, payment FROM jobs WHERE worker_pubkey = ? ORDER BY created_at DESC"
      )
      .all(pubkey);

    res.json({
      agent: onChain || {
        agentPubkey: offChain.agent_pubkey,
        displayName: offChain.display_name,
        wallet: offChain.wallet,
        registeredAt: offChain.registered_at,
        totalSales: offChain.total_sales,
        totalPurchases: offChain.total_purchases,
        positiveRatings: offChain.positive_ratings,
        negativeRatings: offChain.negative_ratings,
        isVerified: !!offChain.is_verified,
        pda: offChain.pda,
      },
      listings,
      clientJobs,
      workerJobs,
    });
  } catch (err: any) {
    console.error("Get agent error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /agents/:pubkey/profile — Enhanced public profile for seller pages
agentRoutes.get("/:pubkey/profile", async (req: Request, res: Response) => {
  try {
    const { pubkey } = req.params;

    const agent = db
      .prepare("SELECT * FROM agents WHERE agent_pubkey = ?")
      .get(pubkey) as any;

    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    // Products with review stats
    const products = db.prepare(`
      SELECT p.*,
        COALESCE(rs.avg_rating, 0) as avg_rating,
        COALESCE(rs.review_count, 0) as review_count
      FROM products p
      LEFT JOIN (
        SELECT product_id, AVG(rating) as avg_rating, COUNT(*) as review_count
        FROM reviews GROUP BY product_id
      ) rs ON rs.product_id = p.id
      WHERE p.seller_pubkey = ? AND p.active = 1
      ORDER BY p.sales_count DESC
    `).all(pubkey);

    // Volume and sales aggregates
    const stats = db.prepare(`
      SELECT
        COALESCE(SUM(sales_count), 0) as total_sold,
        COALESCE(SUM(sales_count * price), 0) as total_volume,
        COUNT(*) as product_count
      FROM products
      WHERE seller_pubkey = ? AND active = 1
    `).get(pubkey) as any;

    // Recent reviews across all seller products
    const reviews = db.prepare(`
      SELECT r.*, p.title as product_title,
        COALESCE(a.display_name, substr(r.reviewer_pubkey, 1, 12)) as reviewer_name
      FROM reviews r
      JOIN products p ON p.id = r.product_id
      LEFT JOIN agents a ON a.agent_pubkey = r.reviewer_pubkey
      WHERE p.seller_pubkey = ?
      ORDER BY r.created_at DESC
      LIMIT 20
    `).all(pubkey);

    // Average rating across all products
    const ratingStats = db.prepare(`
      SELECT AVG(r.rating) as avg_rating, COUNT(r.id) as review_count
      FROM reviews r
      JOIN products p ON p.id = r.product_id
      WHERE p.seller_pubkey = ?
    `).get(pubkey) as any;

    // Jobs completed as worker
    const jobsCompleted = db.prepare(`
      SELECT COUNT(*) as n FROM jobs WHERE worker_pubkey = ? AND status = 'completed'
    `).get(pubkey) as any;

    res.json({
      agent: {
        pubkey: agent.agent_pubkey,
        displayName: agent.display_name,
        wallet: agent.wallet,
        registeredAt: agent.registered_at,
        isVerified: !!agent.is_verified,
      },
      products,
      reviews,
      stats: {
        totalSold: stats.total_sold,
        totalVolume: stats.total_volume,
        productCount: stats.product_count,
        avgRating: ratingStats.avg_rating ? Math.round(ratingStats.avg_rating * 10) / 10 : 0,
        reviewCount: ratingStats.review_count,
        jobsCompleted: jobsCompleted.n,
      },
    });
  } catch (err: any) {
    console.error("Agent profile error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /agents — List all agents
agentRoutes.get("/", async (req: Request, res: Response) => {
  try {
    const agents = db
      .prepare(`
        SELECT agent_pubkey, display_name, wallet, registered_at, 
               total_sales, total_purchases, positive_ratings, negative_ratings, is_verified
        FROM agents 
        ORDER BY total_sales DESC
        LIMIT 100
      `)
      .all();

    res.json({ agents, total: agents.length });
  } catch (err: any) {
    console.error("List agents error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
