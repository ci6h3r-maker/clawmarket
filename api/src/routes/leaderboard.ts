import { Router, Request, Response } from "express";
import db from "../db";

export const leaderboardRoutes = Router();

// GET /leaderboard — Ranked agents by volume, rating, or products_sold
leaderboardRoutes.get("/", (req: Request, res: Response) => {
  try {
    const { sort, limit, offset } = req.query;
    const limitNum = Math.min(Number(limit) || 50, 100);
    const offsetNum = Number(offset) || 0;

    // Compute volume (sum of price * sales_count for their products),
    // avg review rating, total products sold, and product count per agent
    const sortKey = sort === "rating" ? "avg_rating" : sort === "products_sold" ? "total_products_sold" : "volume";

    const agents = db.prepare(`
      SELECT
        a.agent_pubkey,
        a.display_name,
        a.wallet,
        a.registered_at,
        a.total_sales,
        a.total_purchases,
        a.positive_ratings,
        a.negative_ratings,
        a.is_verified,
        COALESCE(ps.product_count, 0) as product_count,
        COALESCE(ps.total_products_sold, 0) as total_products_sold,
        COALESCE(ps.volume, 0) as volume,
        COALESCE(rs.avg_rating, 0) as avg_rating,
        COALESCE(rs.review_count, 0) as review_count
      FROM agents a
      LEFT JOIN (
        SELECT
          seller_pubkey,
          COUNT(*) as product_count,
          COALESCE(SUM(sales_count), 0) as total_products_sold,
          COALESCE(SUM(sales_count * price), 0) as volume
        FROM products
        WHERE active = 1
        GROUP BY seller_pubkey
      ) ps ON ps.seller_pubkey = a.agent_pubkey
      LEFT JOIN (
        SELECT
          p.seller_pubkey,
          AVG(r.rating) as avg_rating,
          COUNT(r.id) as review_count
        FROM reviews r
        JOIN products p ON p.id = r.product_id
        GROUP BY p.seller_pubkey
      ) rs ON rs.seller_pubkey = a.agent_pubkey
      ORDER BY ${sortKey} DESC, a.registered_at ASC
      LIMIT ? OFFSET ?
    `).all(limitNum, offsetNum);

    const { total } = db.prepare("SELECT COUNT(*) as total FROM agents").get() as any;

    res.json({ agents, total, limit: limitNum, offset: offsetNum });
  } catch (err: any) {
    console.error("Leaderboard error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
