import { Router, Request, Response } from "express";
import { PublicKey } from "@solana/web3.js";
import { randomUUID } from "crypto";
import db from "../db";
import { verifySignature, AuthenticatedRequest } from "../middleware/auth";
import {
  buildCreateListingTx,
  buildPurchaseTx,
  buildRateListingTx,
  deriveAgentPda,
  deriveListingPda,
  fetchListing,
} from "../solana/programs";

export const productRoutes = Router();

// GET /products — Search and list products
productRoutes.get("/", (req: Request, res: Response) => {
  try {
    const {
      category,
      max_price,
      min_price,
      seller,
      search,
      sort,
      order,
      limit,
      offset,
    } = req.query;

    let query = `
      SELECT p.*, a.display_name as seller_display_name 
      FROM products p 
      LEFT JOIN agents a ON p.seller_pubkey = a.agent_pubkey 
      WHERE p.active = 1`;
    const params: any[] = [];

    if (category) {
      query += " AND p.category = ?";
      params.push(category);
    }

    if (max_price) {
      query += " AND p.price <= ?";
      params.push(Number(max_price));
    }

    if (min_price) {
      query += " AND p.price >= ?";
      params.push(Number(min_price));
    }

    if (seller) {
      query += " AND p.seller_pubkey = ?";
      params.push(seller);
    }

    if (search) {
      query += " AND (p.title LIKE ? OR p.description LIKE ?)";
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }

    // Sorting
    const sortField = sort === "price" ? "p.price" : sort === "sales" ? "p.sales_count" : "p.created_at";
    const sortOrder = order === "asc" ? "ASC" : "DESC";
    query += ` ORDER BY ${sortField} ${sortOrder}`;

    // Pagination
    const limitNum = Math.min(Number(limit) || 50, 100);
    const offsetNum = Number(offset) || 0;
    query += " LIMIT ? OFFSET ?";
    params.push(limitNum, offsetNum);

    const products = db.prepare(query).all(...params);

    // Get total count for pagination
    let countQuery = "SELECT COUNT(*) as total FROM products WHERE active = 1";
    const countParams: any[] = [];
    if (category) {
      countQuery += " AND category = ?";
      countParams.push(category);
    }
    if (max_price) {
      countQuery += " AND price <= ?";
      countParams.push(Number(max_price));
    }
    if (min_price) {
      countQuery += " AND price >= ?";
      countParams.push(Number(min_price));
    }
    if (seller) {
      countQuery += " AND seller_pubkey = ?";
      countParams.push(seller);
    }
    if (search) {
      countQuery += " AND (title LIKE ? OR description LIKE ?)";
      const searchPattern = `%${search}%`;
      countParams.push(searchPattern, searchPattern);
    }

    const { total } = db.prepare(countQuery).get(...countParams) as any;

    res.json({ products, total, limit: limitNum, offset: offsetNum });
  } catch (err: any) {
    console.error("List products error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /products/:id — Get single product with review stats
productRoutes.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const product = db
      .prepare("SELECT * FROM products WHERE id = ?")
      .get(id) as any;

    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    // Get review stats
    const reviewStats = db
      .prepare(
        `SELECT COUNT(*) as review_count, COALESCE(AVG(rating), 0) as avg_rating
         FROM reviews WHERE product_id = ?`
      )
      .get(id) as any;

    // Try to get on-chain data
    let onChain = null;
    try {
      onChain = await fetchListing(new PublicKey(product.pda));
    } catch {
      // On-chain data may not be available (e.g., localnet down)
    }

    res.json({
      product,
      onChain,
      reviewStats: {
        reviewCount: reviewStats.review_count,
        avgRating: Math.round(reviewStats.avg_rating * 10) / 10,
      },
    });
  } catch (err: any) {
    console.error("Get product error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /products/:id/reviews — List reviews for a product
productRoutes.get("/:id/reviews", (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { limit, offset } = req.query;

    const product = db
      .prepare("SELECT id FROM products WHERE id = ?")
      .get(id);

    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const limitNum = Math.min(Number(limit) || 50, 100);
    const offsetNum = Number(offset) || 0;

    const reviews = db
      .prepare(
        `SELECT r.id, r.product_id, r.reviewer_pubkey, r.rating, r.comment, r.created_at,
                a.wallet as reviewer_wallet, a.positive_ratings as reviewer_pos_ratings,
                a.negative_ratings as reviewer_neg_ratings, a.is_verified as reviewer_verified
         FROM reviews r
         JOIN agents a ON a.agent_pubkey = r.reviewer_pubkey
         WHERE r.product_id = ?
         ORDER BY r.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(id, limitNum, offsetNum);

    const { total } = db
      .prepare("SELECT COUNT(*) as total FROM reviews WHERE product_id = ?")
      .get(id) as any;

    const stats = db
      .prepare(
        `SELECT COALESCE(AVG(rating), 0) as avg_rating,
                COUNT(*) as review_count,
                SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) as positive,
                SUM(CASE WHEN rating <= 2 THEN 1 ELSE 0 END) as negative
         FROM reviews WHERE product_id = ?`
      )
      .get(id) as any;

    res.json({
      reviews,
      total,
      limit: limitNum,
      offset: offsetNum,
      stats: {
        avgRating: Math.round(stats.avg_rating * 10) / 10,
        reviewCount: stats.review_count,
        positive: stats.positive || 0,
        negative: stats.negative || 0,
      },
    });
  } catch (err: any) {
    console.error("List reviews error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /products/:id/reviews — Add a review (bot-only, requires signature auth)
productRoutes.post(
  "/:id/reviews",
  verifySignature(),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { agent_pubkey, rating, comment } = req.body;

      if (!rating || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
        res.status(400).json({ error: "Rating must be an integer from 1 to 5" });
        return;
      }

      const product = db
        .prepare("SELECT * FROM products WHERE id = ?")
        .get(id) as any;

      if (!product) {
        res.status(404).json({ error: "Product not found" });
        return;
      }

      // Sellers cannot review their own products
      if (product.seller_pubkey === agent_pubkey) {
        res.status(403).json({ error: "Cannot review your own product" });
        return;
      }

      // Check for existing review (UNIQUE constraint would catch this too)
      const existing = db
        .prepare("SELECT id FROM reviews WHERE product_id = ? AND reviewer_pubkey = ?")
        .get(id, agent_pubkey);

      if (existing) {
        res.status(409).json({ error: "You have already reviewed this product" });
        return;
      }

      const reviewId = randomUUID();
      db.prepare(
        `INSERT INTO reviews (id, product_id, reviewer_pubkey, rating, comment)
         VALUES (?, ?, ?, ?, ?)`
      ).run(reviewId, id, agent_pubkey, rating, comment || null);

      // Update product rating counters
      if (rating >= 4) {
        db.prepare(
          "UPDATE products SET positive_ratings = positive_ratings + 1 WHERE id = ?"
        ).run(id);
      } else if (rating <= 2) {
        db.prepare(
          "UPDATE products SET negative_ratings = negative_ratings + 1 WHERE id = ?"
        ).run(id);
      }

      res.status(201).json({
        id: reviewId,
        product_id: id,
        reviewer_pubkey: agent_pubkey,
        rating,
        comment: comment || null,
        message: "Review submitted successfully",
      });
    } catch (err: any) {
      console.error("Create review error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// POST /products — Create a product listing
productRoutes.post(
  "/",
  verifySignature(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { agent_pubkey, price, content_hash, title, description, category } =
        req.body;

      if (!price || !content_hash) {
        res.status(400).json({ error: "Missing required fields: price, content_hash" });
        return;
      }

      if (price <= 0) {
        res.status(400).json({ error: "Price must be greater than zero" });
        return;
      }

      // Get agent's wallet from DB
      const agent = db
        .prepare("SELECT wallet FROM agents WHERE agent_pubkey = ?")
        .get(agent_pubkey) as any;

      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }

      const seller = new PublicKey(agent.wallet);
      const contentHashBuffer = Buffer.from(content_hash, "hex");

      if (contentHashBuffer.length !== 32) {
        res.status(400).json({ error: "content_hash must be 32 bytes (64 hex chars)" });
        return;
      }

      // Build the on-chain transaction
      const tx = await buildCreateListingTx(
        seller,
        BigInt(price),
        contentHashBuffer
      );
      const serializedTx = tx
        .serialize({ requireAllSignatures: false })
        .toString("base64");

      // Derive the listing PDA
      const [listingPda] = deriveListingPda(seller, contentHashBuffer);

      // Insert into off-chain index
      const id = randomUUID();
      const now = Math.floor(Date.now() / 1000);
      db.prepare(
        `INSERT INTO products (id, pda, seller_pubkey, price, content_hash, title, description, category, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        listingPda.toBase58(),
        agent_pubkey,
        price,
        content_hash,
        title || null,
        description || null,
        category || null,
        now
      );

      res.status(201).json({
        id,
        pda: listingPda.toBase58(),
        transaction: serializedTx,
        message:
          "Sign this transaction with your Solana wallet and submit to create the on-chain listing",
      });
    } catch (err: any) {
      console.error("Create product error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// POST /products/:id/purchase — Buy a product
productRoutes.post(
  "/:id/purchase",
  verifySignature(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { agent_pubkey } = req.body;

      // Get product from DB
      const product = db
        .prepare("SELECT * FROM products WHERE id = ? AND active = 1")
        .get(id) as any;

      if (!product) {
        res.status(404).json({ error: "Product not found or inactive" });
        return;
      }

      // Get buyer's wallet
      const buyer = db
        .prepare("SELECT wallet FROM agents WHERE agent_pubkey = ?")
        .get(agent_pubkey) as any;

      // Get seller's agent record for verification status
      const sellerAgent = db
        .prepare("SELECT wallet, pda FROM agents WHERE agent_pubkey = ?")
        .get(product.seller_pubkey) as any;

      if (!sellerAgent) {
        res.status(500).json({ error: "Seller agent record not found" });
        return;
      }

      const buyerWallet = new PublicKey(buyer.wallet);
      const sellerWallet = new PublicKey(sellerAgent.wallet);
      const sellerAgentPda = new PublicKey(sellerAgent.pda);
      const listingPda = new PublicKey(product.pda);

      const tx = await buildPurchaseTx(
        listingPda,
        sellerWallet,
        sellerAgentPda,
        buyerWallet
      );
      const serializedTx = tx
        .serialize({ requireAllSignatures: false })
        .toString("base64");

      res.json({
        product_id: id,
        price: product.price,
        transaction: serializedTx,
        message:
          "Sign this transaction with your Solana wallet and submit to complete the purchase",
      });
    } catch (err: any) {
      console.error("Purchase error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// POST /products/:id/rate — Rate a product (like/dislike)
productRoutes.post(
  "/:id/rate",
  verifySignature(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { agent_pubkey, positive } = req.body;

      if (typeof positive !== "boolean") {
        res.status(400).json({ error: "Missing required field: positive (boolean)" });
        return;
      }

      const product = db
        .prepare("SELECT * FROM products WHERE id = ?")
        .get(id) as any;

      if (!product) {
        res.status(404).json({ error: "Product not found" });
        return;
      }

      // Get buyer's wallet
      const buyer = db
        .prepare("SELECT wallet FROM agents WHERE agent_pubkey = ?")
        .get(agent_pubkey) as any;

      const buyerWallet = new PublicKey(buyer.wallet);
      const listingPda = new PublicKey(product.pda);

      const tx = await buildRateListingTx(listingPda, buyerWallet, positive);
      const serializedTx = tx
        .serialize({ requireAllSignatures: false })
        .toString("base64");

      // Update off-chain index optimistically
      if (positive) {
        db.prepare(
          "UPDATE products SET positive_ratings = positive_ratings + 1 WHERE id = ?"
        ).run(id);
      } else {
        db.prepare(
          "UPDATE products SET negative_ratings = negative_ratings + 1 WHERE id = ?"
        ).run(id);
      }

      res.json({
        product_id: id,
        positive,
        transaction: serializedTx,
        message: "Sign this transaction with your Solana wallet to submit your rating",
      });
    } catch (err: any) {
      console.error("Rate product error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);
