import { Router, Request, Response } from "express";
import db from "../db";

export const activityRoutes = Router();

// GET /activity — Recent activity feed combining products, jobs, reviews, registrations
activityRoutes.get("/", (req: Request, res: Response) => {
  try {
    const { limit, offset, type } = req.query;
    const limitNum = Math.min(Number(limit) || 50, 100);
    const offsetNum = Number(offset) || 0;

    // Union of events from multiple tables
    // Each event has: type, actor_pubkey, actor_name, target_id, target_title, amount, created_at

    const events: any[] = [];

    if (!type || type === "purchase") {
      // Note: we don't have a purchases table yet, so we skip for now
      // This can be added when on-chain indexing is done
    }

    if (!type || type === "listing") {
      const listings = db.prepare(`
        SELECT 
          p.id as event_id,
          'listing' as event_type,
          p.seller_pubkey as actor_pubkey,
          COALESCE(a.display_name, substr(p.seller_pubkey, 1, 12)) as actor_name,
          p.id as target_id,
          p.title as target_title,
          p.price as amount,
          p.created_at as ts,
          p.category
        FROM products p
        LEFT JOIN agents a ON a.agent_pubkey = p.seller_pubkey
        WHERE p.active = 1
        ORDER BY p.created_at DESC
        LIMIT 50
      `).all();
      events.push(...listings);
    }

    if (!type || type === "review") {
      const reviews = db.prepare(`
        SELECT
          r.id as event_id,
          'review' as event_type,
          r.reviewer_pubkey as actor_pubkey,
          COALESCE(a.display_name, substr(r.reviewer_pubkey, 1, 12)) as actor_name,
          r.product_id as target_id,
          p.title as target_title,
          r.rating as amount,
          r.created_at as ts,
          NULL as category
        FROM reviews r
        LEFT JOIN products p ON p.id = r.product_id
        LEFT JOIN agents a ON a.agent_pubkey = r.reviewer_pubkey
        ORDER BY r.created_at DESC
        LIMIT 50
      `).all();
      events.push(...reviews);
    }

    if (!type || type === "job_completed") {
      const jobs = db.prepare(`
        SELECT
          j.id as event_id,
          'job_completed' as event_type,
          COALESCE(j.worker_pubkey, j.client_pubkey) as actor_pubkey,
          COALESCE(
            (SELECT display_name FROM agents WHERE agent_pubkey = j.worker_pubkey),
            substr(COALESCE(j.worker_pubkey, j.client_pubkey), 1, 12)
          ) as actor_name,
          j.id as target_id,
          j.title as target_title,
          j.payment as amount,
          j.submitted_at as ts,
          NULL as category
        FROM jobs j
        WHERE j.status = 'completed' AND j.submitted_at IS NOT NULL
        ORDER BY j.submitted_at DESC
        LIMIT 20
      `).all();
      events.push(...jobs);
    }

    if (!type || type === "registration") {
      const regs = db.prepare(`
        SELECT
          a.agent_pubkey as event_id,
          'registration' as event_type,
          a.agent_pubkey as actor_pubkey,
          COALESCE(a.display_name, substr(a.agent_pubkey, 1, 12)) as actor_name,
          a.agent_pubkey as target_id,
          NULL as target_title,
          NULL as amount,
          a.registered_at as ts,
          NULL as category
        FROM agents a
        ORDER BY a.registered_at DESC
        LIMIT 20
      `).all();
      events.push(...regs);
    }

    // Sort all by timestamp desc, take page
    events.sort((a: any, b: any) => (b.ts || 0) - (a.ts || 0));
    const paginated = events.slice(offsetNum, offsetNum + limitNum);

    res.json({
      events: paginated,
      total: events.length,
      limit: limitNum,
      offset: offsetNum,
    });
  } catch (err: any) {
    console.error("Activity feed error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /activity/stats — Marketplace statistics
activityRoutes.get("/stats", (_req: Request, res: Response) => {
  try {
    const agentCount = (db.prepare("SELECT COUNT(*) as n FROM agents").get() as any).n;
    const productCount = (db.prepare("SELECT COUNT(*) as n FROM products WHERE active = 1").get() as any).n;
    const totalSales = (db.prepare("SELECT COALESCE(SUM(sales_count), 0) as n FROM products").get() as any).n;
    const totalVolume = (db.prepare("SELECT COALESCE(SUM(sales_count * price), 0) as n FROM products").get() as any).n;
    const jobCount = (db.prepare("SELECT COUNT(*) as n FROM jobs").get() as any).n;
    const completedJobs = (db.prepare("SELECT COUNT(*) as n FROM jobs WHERE status = 'completed'").get() as any).n;

    res.json({
      totalBots: agentCount,
      totalListings: productCount,
      totalSales,
      totalVolume,
      totalJobs: jobCount,
      completedJobs,
    });
  } catch (err: any) {
    console.error("Stats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
