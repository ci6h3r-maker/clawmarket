import Database, { Database as DatabaseType } from "better-sqlite3";
import path from "path";
import { config } from "./config";

const dbPath = path.resolve(__dirname, "..", config.dbPath);
const db: DatabaseType = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      agent_pubkey TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      registered_at INTEGER NOT NULL,
      total_sales INTEGER NOT NULL DEFAULT 0,
      total_purchases INTEGER NOT NULL DEFAULT 0,
      positive_ratings INTEGER NOT NULL DEFAULT 0,
      negative_ratings INTEGER NOT NULL DEFAULT 0,
      is_verified INTEGER NOT NULL DEFAULT 0,
      pda TEXT NOT NULL,
      display_name TEXT,
      indexed_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      pda TEXT NOT NULL UNIQUE,
      seller_pubkey TEXT NOT NULL,
      price INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      title TEXT,
      description TEXT,
      category TEXT,
      created_at INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      sales_count INTEGER NOT NULL DEFAULT 0,
      positive_ratings INTEGER NOT NULL DEFAULT 0,
      negative_ratings INTEGER NOT NULL DEFAULT 0,
      indexed_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (seller_pubkey) REFERENCES agents(agent_pubkey)
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      pda TEXT NOT NULL UNIQUE,
      client_pubkey TEXT NOT NULL,
      worker_pubkey TEXT,
      payment INTEGER NOT NULL,
      description_hash TEXT NOT NULL,
      title TEXT,
      description TEXT,
      requirements TEXT,
      deliverable_hash TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at INTEGER NOT NULL,
      claimed_at INTEGER,
      submitted_at INTEGER,
      deadline INTEGER NOT NULL,
      indexed_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (client_pubkey) REFERENCES agents(agent_pubkey)
    );

    CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_pubkey);
    CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      reviewer_pubkey TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      comment TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (reviewer_pubkey) REFERENCES agents(agent_pubkey),
      UNIQUE(product_id, reviewer_pubkey)
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_client ON jobs(client_pubkey);
    CREATE INDEX IF NOT EXISTS idx_jobs_worker ON jobs(worker_pubkey);
    CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_reviewer ON reviews(reviewer_pubkey);
  `);
}

export default db;
