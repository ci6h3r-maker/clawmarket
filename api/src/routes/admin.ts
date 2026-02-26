import { Router, Request, Response, NextFunction } from "express";
import db from "../db";

export const adminRoutes = Router();

const ADMIN_PUBKEY = "CipherBot001";

// Simple admin auth middleware — checks x-admin-key header
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const adminKey = req.headers["x-admin-key"];
  if (adminKey !== ADMIN_PUBKEY) {
    res.status(403).json({ error: "Forbidden: admin access required" });
    return;
  }
  next();
}

adminRoutes.use(requireAdmin);

// GET /admin/agents — All agents with full data
adminRoutes.get("/agents", (req: Request, res: Response) => {
  try {
    const { search, limit, offset } = req.query;
    const limitNum = Math.min(Number(limit) || 100, 500);
    const offsetNum = Number(offset) || 0;

    let query = "SELECT * FROM agents";
    const params: any[] = [];

    if (search) {
      query += " WHERE agent_pubkey LIKE ? OR display_name LIKE ? OR wallet LIKE ?";
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    query += " ORDER BY registered_at DESC LIMIT ? OFFSET ?";
    params.push(limitNum, offsetNum);

    const agents = db.prepare(query).all(...params);

    let countQuery = "SELECT COUNT(*) as total FROM agents";
    const countParams: any[] = [];
    if (search) {
      countQuery += " WHERE agent_pubkey LIKE ? OR display_name LIKE ? OR wallet LIKE ?";
      const s = `%${search}%`;
      countParams.push(s, s, s);
    }
    const { total } = db.prepare(countQuery).get(...countParams) as any;

    res.json({ agents, total, limit: limitNum, offset: offsetNum });
  } catch (err: any) {
    console.error("Admin agents error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/products — All products including inactive/draft
adminRoutes.get("/products", (req: Request, res: Response) => {
  try {
    const { search, category, active, limit, offset } = req.query;
    const limitNum = Math.min(Number(limit) || 100, 500);
    const offsetNum = Number(offset) || 0;

    let query = `
      SELECT p.*, a.display_name as seller_display_name
      FROM products p
      LEFT JOIN agents a ON p.seller_pubkey = a.agent_pubkey
      WHERE 1=1`;
    const params: any[] = [];

    if (active !== undefined) {
      query += " AND p.active = ?";
      params.push(Number(active));
    }

    if (category) {
      query += " AND p.category = ?";
      params.push(category);
    }

    if (search) {
      query += " AND (p.title LIKE ? OR p.description LIKE ? OR p.seller_pubkey LIKE ?)";
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    query += " ORDER BY p.created_at DESC LIMIT ? OFFSET ?";
    params.push(limitNum, offsetNum);

    const products = db.prepare(query).all(...params);

    // Count
    let countQuery = "SELECT COUNT(*) as total FROM products WHERE 1=1";
    const countParams: any[] = [];
    if (active !== undefined) {
      countQuery += " AND active = ?";
      countParams.push(Number(active));
    }
    if (category) {
      countQuery += " AND category = ?";
      countParams.push(category);
    }
    if (search) {
      countQuery += " AND (title LIKE ? OR description LIKE ? OR seller_pubkey LIKE ?)";
      const s = `%${search}%`;
      countParams.push(s, s, s);
    }
    const { total } = db.prepare(countQuery).get(...countParams) as any;

    res.json({ products, total, limit: limitNum, offset: offsetNum });
  } catch (err: any) {
    console.error("Admin products error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/transactions — Combined view of all sales activity + reviews + jobs
adminRoutes.get("/transactions", (req: Request, res: Response) => {
  try {
    const { type, limit, offset } = req.query;
    const limitNum = Math.min(Number(limit) || 100, 500);
    const offsetNum = Number(offset) || 0;

    const events: any[] = [];

    if (!type || type === "listing") {
      const listings = db.prepare(`
        SELECT
          p.id, 'listing' as type, p.seller_pubkey as actor,
          COALESCE(a.display_name, substr(p.seller_pubkey, 1, 12)) as actor_name,
          p.title, p.price as amount, p.category,
          p.sales_count, p.created_at as ts
        FROM products p
        LEFT JOIN agents a ON a.agent_pubkey = p.seller_pubkey
        ORDER BY p.created_at DESC
        LIMIT 200
      `).all();
      events.push(...listings);
    }

    if (!type || type === "review") {
      const reviews = db.prepare(`
        SELECT
          r.id, 'review' as type, r.reviewer_pubkey as actor,
          COALESCE(a.display_name, substr(r.reviewer_pubkey, 1, 12)) as actor_name,
          p.title, r.rating as amount, p.category,
          NULL as sales_count, r.created_at as ts
        FROM reviews r
        LEFT JOIN products p ON p.id = r.product_id
        LEFT JOIN agents a ON a.agent_pubkey = r.reviewer_pubkey
        ORDER BY r.created_at DESC
        LIMIT 200
      `).all();
      events.push(...reviews);
    }

    if (!type || type === "job") {
      const jobs = db.prepare(`
        SELECT
          j.id, 'job' as type,
          COALESCE(j.worker_pubkey, j.client_pubkey) as actor,
          COALESCE(
            (SELECT display_name FROM agents WHERE agent_pubkey = COALESCE(j.worker_pubkey, j.client_pubkey)),
            substr(COALESCE(j.worker_pubkey, j.client_pubkey), 1, 12)
          ) as actor_name,
          j.title, j.payment as amount, j.status as category,
          NULL as sales_count, j.created_at as ts
        FROM jobs j
        ORDER BY j.created_at DESC
        LIMIT 200
      `).all();
      events.push(...jobs);
    }

    if (!type || type === "registration") {
      const regs = db.prepare(`
        SELECT
          a.agent_pubkey as id, 'registration' as type,
          a.agent_pubkey as actor,
          COALESCE(a.display_name, substr(a.agent_pubkey, 1, 12)) as actor_name,
          'Agent registered' as title, NULL as amount, NULL as category,
          NULL as sales_count, a.registered_at as ts
        FROM agents a
        ORDER BY a.registered_at DESC
        LIMIT 200
      `).all();
      events.push(...regs);
    }

    events.sort((a: any, b: any) => (b.ts || 0) - (a.ts || 0));
    const total = events.length;
    const paginated = events.slice(offsetNum, offsetNum + limitNum);

    res.json({ transactions: paginated, total, limit: limitNum, offset: offsetNum });
  } catch (err: any) {
    console.error("Admin transactions error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/stats — Extended platform statistics
adminRoutes.get("/stats", (_req: Request, res: Response) => {
  try {
    const agentCount = (db.prepare("SELECT COUNT(*) as n FROM agents").get() as any).n;
    const productCount = (db.prepare("SELECT COUNT(*) as n FROM products").get() as any).n;
    const activeProducts = (db.prepare("SELECT COUNT(*) as n FROM products WHERE active = 1").get() as any).n;
    const inactiveProducts = productCount - activeProducts;
    const totalSales = (db.prepare("SELECT COALESCE(SUM(sales_count), 0) as n FROM products").get() as any).n;
    const totalVolume = (db.prepare("SELECT COALESCE(SUM(sales_count * price), 0) as n FROM products").get() as any).n;
    const jobCount = (db.prepare("SELECT COUNT(*) as n FROM jobs").get() as any).n;
    const completedJobs = (db.prepare("SELECT COUNT(*) as n FROM jobs WHERE status = 'completed'").get() as any).n;
    const openJobs = (db.prepare("SELECT COUNT(*) as n FROM jobs WHERE status = 'open'").get() as any).n;
    const disputedJobs = (db.prepare("SELECT COUNT(*) as n FROM jobs WHERE status = 'disputed'").get() as any).n;
    const reviewCount = (db.prepare("SELECT COUNT(*) as n FROM reviews").get() as any).n;
    const avgRating = (db.prepare("SELECT COALESCE(AVG(rating), 0) as n FROM reviews").get() as any).n;
    const verifiedAgents = (db.prepare("SELECT COUNT(*) as n FROM agents WHERE is_verified = 1").get() as any).n;

    res.json({
      agents: { total: agentCount, verified: verifiedAgents },
      products: { total: productCount, active: activeProducts, inactive: inactiveProducts },
      sales: { total: totalSales, volume: totalVolume },
      jobs: { total: jobCount, completed: completedJobs, open: openJobs, disputed: disputedJobs },
      reviews: { total: reviewCount, avgRating: Math.round(avgRating * 10) / 10 },
    });
  } catch (err: any) {
    console.error("Admin stats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/leaderboard-debug — Raw leaderboard data for debugging
adminRoutes.get("/leaderboard-debug", (_req: Request, res: Response) => {
  try {
    const agents = db.prepare(`
      SELECT
        a.agent_pubkey,
        a.display_name,
        a.total_sales,
        a.positive_ratings,
        a.negative_ratings,
        a.is_verified,
        a.registered_at,
        COALESCE(ps.product_count, 0) as product_count,
        COALESCE(ps.total_products_sold, 0) as total_products_sold,
        COALESCE(ps.volume, 0) as volume,
        COALESCE(rs.avg_rating, 0) as avg_rating,
        COALESCE(rs.review_count, 0) as review_count,
        ps.categories,
        ps.top_product
      FROM agents a
      LEFT JOIN (
        SELECT
          seller_pubkey,
          COUNT(*) as product_count,
          COALESCE(SUM(sales_count), 0) as total_products_sold,
          COALESCE(SUM(sales_count * price), 0) as volume,
          GROUP_CONCAT(DISTINCT category) as categories,
          (SELECT title FROM products p2 WHERE p2.seller_pubkey = products.seller_pubkey ORDER BY sales_count DESC LIMIT 1) as top_product
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
      ORDER BY volume DESC
    `).all();

    res.json({ agents, generated_at: Math.floor(Date.now() / 1000) });
  } catch (err: any) {
    console.error("Admin leaderboard debug error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
