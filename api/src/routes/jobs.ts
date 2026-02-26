import { Router, Request, Response } from "express";
import { PublicKey } from "@solana/web3.js";
import { randomUUID } from "crypto";
import db from "../db";
import { verifySignature, AuthenticatedRequest } from "../middleware/auth";
import {
  buildPostJobTx,
  buildClaimJobTx,
  buildSubmitWorkTx,
  buildAcceptWorkTx,
  buildDisputeWorkTx,
  deriveAgentPda,
  deriveJobPda,
  fetchJob,
} from "../solana/programs";

export const jobRoutes = Router();

// GET /jobs — List jobs with filters
jobRoutes.get("/", (req: Request, res: Response) => {
  try {
    const { status, client, worker, search, sort, order, limit, offset } =
      req.query;

    let query = "SELECT * FROM jobs WHERE 1=1";
    const params: any[] = [];

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    if (client) {
      query += " AND client_pubkey = ?";
      params.push(client);
    }

    if (worker) {
      query += " AND worker_pubkey = ?";
      params.push(worker);
    }

    if (search) {
      query += " AND (title LIKE ? OR description LIKE ?)";
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }

    // Sorting
    const sortField =
      sort === "payment" ? "payment" : sort === "deadline" ? "deadline" : "created_at";
    const sortOrder = order === "asc" ? "ASC" : "DESC";
    query += ` ORDER BY ${sortField} ${sortOrder}`;

    // Pagination
    const limitNum = Math.min(Number(limit) || 50, 100);
    const offsetNum = Number(offset) || 0;
    query += " LIMIT ? OFFSET ?";
    params.push(limitNum, offsetNum);

    const jobs = db.prepare(query).all(...params);

    // Count
    let countQuery = "SELECT COUNT(*) as total FROM jobs WHERE 1=1";
    const countParams: any[] = [];
    if (status) {
      countQuery += " AND status = ?";
      countParams.push(status);
    }
    if (client) {
      countQuery += " AND client_pubkey = ?";
      countParams.push(client);
    }
    if (worker) {
      countQuery += " AND worker_pubkey = ?";
      countParams.push(worker);
    }
    if (search) {
      countQuery += " AND (title LIKE ? OR description LIKE ?)";
      const searchPattern = `%${search}%`;
      countParams.push(searchPattern, searchPattern);
    }

    const { total } = db.prepare(countQuery).get(...countParams) as any;

    res.json({ jobs, total, limit: limitNum, offset: offsetNum });
  } catch (err: any) {
    console.error("List jobs error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /jobs/:id — Get single job
jobRoutes.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as any;

    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    // Try to get on-chain data
    let onChain = null;
    try {
      onChain = await fetchJob(new PublicKey(job.pda));
    } catch {
      // On-chain data may not be available
    }

    res.json({ job, onChain });
  } catch (err: any) {
    console.error("Get job error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /jobs — Post a new service job
jobRoutes.post(
  "/",
  verifySignature(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        agent_pubkey,
        payment,
        description_hash,
        deadline,
        title,
        description,
        requirements,
      } = req.body;

      if (!payment || !description_hash || !deadline) {
        res.status(400).json({
          error: "Missing required fields: payment, description_hash, deadline",
        });
        return;
      }

      if (payment <= 0) {
        res.status(400).json({ error: "Payment must be greater than zero" });
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      if (deadline <= now) {
        res.status(400).json({ error: "Deadline must be in the future" });
        return;
      }

      const descHashBuffer = Buffer.from(description_hash, "hex");
      if (descHashBuffer.length !== 32) {
        res.status(400).json({
          error: "description_hash must be 32 bytes (64 hex chars)",
        });
        return;
      }

      // Get agent's wallet
      const agent = db
        .prepare("SELECT wallet FROM agents WHERE agent_pubkey = ?")
        .get(agent_pubkey) as any;

      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }

      const clientWallet = new PublicKey(agent.wallet);

      const tx = await buildPostJobTx(
        clientWallet,
        BigInt(payment),
        descHashBuffer,
        BigInt(deadline)
      );
      const serializedTx = tx
        .serialize({ requireAllSignatures: false })
        .toString("base64");

      const [jobPda] = deriveJobPda(clientWallet, descHashBuffer);

      // Insert into off-chain index
      const id = randomUUID();
      db.prepare(
        `INSERT INTO jobs (id, pda, client_pubkey, payment, description_hash, title, description, requirements, created_at, deadline, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`
      ).run(
        id,
        jobPda.toBase58(),
        agent_pubkey,
        payment,
        description_hash,
        title || null,
        description || null,
        requirements ? JSON.stringify(requirements) : null,
        now,
        deadline
      );

      res.status(201).json({
        id,
        pda: jobPda.toBase58(),
        transaction: serializedTx,
        message:
          "Sign this transaction with your Solana wallet to post the job and lock USDC in escrow",
      });
    } catch (err: any) {
      console.error("Post job error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// POST /jobs/:id/claim — Bot claims a job
jobRoutes.post(
  "/:id/claim",
  verifySignature(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { agent_pubkey } = req.body;

      const job = db
        .prepare("SELECT * FROM jobs WHERE id = ? AND status = 'open'")
        .get(id) as any;

      if (!job) {
        res.status(404).json({ error: "Job not found or not open" });
        return;
      }

      // Cannot claim your own job
      if (job.client_pubkey === agent_pubkey) {
        res.status(400).json({ error: "Cannot claim your own job" });
        return;
      }

      const agent = db
        .prepare("SELECT wallet FROM agents WHERE agent_pubkey = ?")
        .get(agent_pubkey) as any;

      const workerWallet = new PublicKey(agent.wallet);
      const jobPda = new PublicKey(job.pda);

      const tx = await buildClaimJobTx(jobPda, workerWallet);
      const serializedTx = tx
        .serialize({ requireAllSignatures: false })
        .toString("base64");

      // Update off-chain index
      const now = Math.floor(Date.now() / 1000);
      db.prepare(
        "UPDATE jobs SET status = 'claimed', worker_pubkey = ?, claimed_at = ? WHERE id = ?"
      ).run(agent_pubkey, now, id);

      res.json({
        job_id: id,
        transaction: serializedTx,
        message: "Sign this transaction with your Solana wallet to claim the job",
      });
    } catch (err: any) {
      console.error("Claim job error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// POST /jobs/:id/submit — Submit deliverable for a job
jobRoutes.post(
  "/:id/submit",
  verifySignature(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { agent_pubkey, deliverable_hash } = req.body;

      if (!deliverable_hash) {
        res.status(400).json({ error: "Missing required field: deliverable_hash" });
        return;
      }

      const deliverableBuffer = Buffer.from(deliverable_hash, "hex");
      if (deliverableBuffer.length !== 32) {
        res.status(400).json({
          error: "deliverable_hash must be 32 bytes (64 hex chars)",
        });
        return;
      }

      const job = db
        .prepare(
          "SELECT * FROM jobs WHERE id = ? AND status = 'claimed' AND worker_pubkey = ?"
        )
        .get(id, agent_pubkey) as any;

      if (!job) {
        res.status(404).json({
          error: "Job not found, not in claimed status, or you are not the assigned worker",
        });
        return;
      }

      const agent = db
        .prepare("SELECT wallet FROM agents WHERE agent_pubkey = ?")
        .get(agent_pubkey) as any;

      const workerWallet = new PublicKey(agent.wallet);
      const jobPda = new PublicKey(job.pda);

      const tx = await buildSubmitWorkTx(jobPda, workerWallet, deliverableBuffer);
      const serializedTx = tx
        .serialize({ requireAllSignatures: false })
        .toString("base64");

      // Update off-chain index
      const now = Math.floor(Date.now() / 1000);
      db.prepare(
        "UPDATE jobs SET status = 'submitted', deliverable_hash = ?, submitted_at = ? WHERE id = ?"
      ).run(deliverable_hash, now, id);

      res.json({
        job_id: id,
        transaction: serializedTx,
        message:
          "Sign this transaction with your Solana wallet to submit your work",
      });
    } catch (err: any) {
      console.error("Submit work error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// POST /jobs/:id/accept — Client accepts submitted work
jobRoutes.post(
  "/:id/accept",
  verifySignature(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { agent_pubkey } = req.body;

      const job = db
        .prepare(
          "SELECT * FROM jobs WHERE id = ? AND status = 'submitted' AND client_pubkey = ?"
        )
        .get(id, agent_pubkey) as any;

      if (!job) {
        res.status(404).json({
          error:
            "Job not found, not in submitted status, or you are not the client",
        });
        return;
      }

      // Get client and worker info
      const clientAgent = db
        .prepare("SELECT wallet FROM agents WHERE agent_pubkey = ?")
        .get(agent_pubkey) as any;

      const workerAgent = db
        .prepare("SELECT wallet, pda FROM agents WHERE agent_pubkey = ?")
        .get(job.worker_pubkey) as any;

      if (!workerAgent) {
        res.status(500).json({ error: "Worker agent record not found" });
        return;
      }

      const clientWallet = new PublicKey(clientAgent.wallet);
      const workerWallet = new PublicKey(workerAgent.wallet);
      const workerAgentPda = new PublicKey(workerAgent.pda);
      const jobPda = new PublicKey(job.pda);

      const tx = await buildAcceptWorkTx(
        jobPda,
        clientWallet,
        workerWallet,
        workerAgentPda
      );
      const serializedTx = tx
        .serialize({ requireAllSignatures: false })
        .toString("base64");

      // Update off-chain index
      db.prepare("UPDATE jobs SET status = 'completed' WHERE id = ?").run(id);

      res.json({
        job_id: id,
        transaction: serializedTx,
        message:
          "Sign this transaction with your Solana wallet to accept the work and release escrow",
      });
    } catch (err: any) {
      console.error("Accept work error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// POST /jobs/:id/dispute — Client disputes submitted work
jobRoutes.post(
  "/:id/dispute",
  verifySignature(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { agent_pubkey } = req.body;

      const job = db
        .prepare(
          "SELECT * FROM jobs WHERE id = ? AND status = 'submitted' AND client_pubkey = ?"
        )
        .get(id, agent_pubkey) as any;

      if (!job) {
        res.status(404).json({
          error:
            "Job not found, not in submitted status, or you are not the client",
        });
        return;
      }

      const clientAgent = db
        .prepare("SELECT wallet FROM agents WHERE agent_pubkey = ?")
        .get(agent_pubkey) as any;

      const clientWallet = new PublicKey(clientAgent.wallet);
      const jobPda = new PublicKey(job.pda);

      const tx = await buildDisputeWorkTx(jobPda, clientWallet);
      const serializedTx = tx
        .serialize({ requireAllSignatures: false })
        .toString("base64");

      // Update off-chain index
      db.prepare("UPDATE jobs SET status = 'disputed' WHERE id = ?").run(id);

      res.json({
        job_id: id,
        transaction: serializedTx,
        message:
          "Sign this transaction with your Solana wallet to dispute the work",
      });
    } catch (err: any) {
      console.error("Dispute work error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);
