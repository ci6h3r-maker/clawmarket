/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { BotIdenticon } from "@/components/BotIdenticon";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3003";
const ADMIN_KEY = "CipherBot001";

type Tab = "overview" | "agents" | "products" | "transactions" | "debug";

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function formatPrice(lamports: number): string {
  if (!lamports) return "$0";
  return `$${(lamports / 1_000_000).toFixed(2)}`;
}

function formatVolume(lamports: number): string {
  if (!lamports) return "$0";
  const usdc = lamports / 1_000_000;
  if (usdc >= 1000) return `$${(usdc / 1000).toFixed(1)}K`;
  return `$${usdc.toFixed(0)}`;
}

function formatDate(ts: number): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function adminFetch(path: string) {
  return fetch(`${API_URL}${path}`, {
    headers: { "X-Admin-Key": ADMIN_KEY },
  });
}

// Stat card used on overview
function StatBox({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="border border-charcoal-50 bg-charcoal-100 p-4">
      <div className="text-[10px] font-mono text-cream-300/30 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-xl font-bold font-mono text-cream">{value}</div>
      {sub && <div className="text-[10px] font-mono text-cream-300/25 mt-1">{sub}</div>}
    </div>
  );
}

// ─── Overview Tab ───
function OverviewPanel() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminFetch("/admin/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (!stats) return <ErrMsg msg="Failed to load stats" />;

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-bold text-cream">Platform Overview</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatBox label="Total Agents" value={stats.agents.total} sub={`${stats.agents.verified} verified`} />
        <StatBox label="Total Products" value={stats.products.total} sub={`${stats.products.active} active / ${stats.products.inactive} inactive`} />
        <StatBox label="Total Sales" value={stats.sales.total} sub={`Volume: ${formatVolume(stats.sales.volume)}`} />
        <StatBox label="Jobs" value={stats.jobs.total} sub={`${stats.jobs.completed} done / ${stats.jobs.open} open / ${stats.jobs.disputed} disputed`} />
        <StatBox label="Reviews" value={stats.reviews.total} sub={`Avg: ${stats.reviews.avgRating}/5`} />
      </div>
    </div>
  );
}

// ─── Agents Tab ───
function AgentsPanel() {
  const [agents, setAgents] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "50" });
    if (search) params.set("search", search);
    adminFetch(`/admin/agents?${params}`)
      .then((r) => r.json())
      .then((d) => { setAgents(d.agents || []); setTotal(d.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-bold text-cream">All Agents ({total})</h3>
        <input
          type="text"
          placeholder="Search pubkey/name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-charcoal-100 border border-charcoal-50 text-cream text-xs font-mono px-3 py-1.5 w-48 sm:w-64 focus:outline-none focus:border-amber/40"
        />
      </div>
      {loading ? <Spinner /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-charcoal-50 text-cream-300/30 text-[10px] uppercase tracking-wider">
                <th className="text-left p-2">Agent</th>
                <th className="text-left p-2 hidden sm:table-cell">Wallet</th>
                <th className="text-right p-2">Sales</th>
                <th className="text-right p-2">Purchases</th>
                <th className="text-right p-2 hidden sm:table-cell">Ratings +/-</th>
                <th className="text-right p-2 hidden md:table-cell">Registered</th>
                <th className="text-center p-2">Verified</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.agent_pubkey} className="border-b border-charcoal-50 hover:bg-charcoal-100/50">
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <BotIdenticon seed={hashCode(a.agent_pubkey)} size={20} />
                      <div className="min-w-0">
                        <div className="text-cream truncate max-w-[120px] sm:max-w-none">
                          {a.display_name || a.agent_pubkey.slice(0, 12) + "..."}
                        </div>
                        <div className="text-cream-300/25 truncate max-w-[100px] sm:hidden">
                          {a.agent_pubkey.slice(0, 8)}...
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-2 text-cream-300/40 hidden sm:table-cell truncate max-w-[120px]">{a.wallet?.slice(0, 8)}...</td>
                  <td className="p-2 text-right text-cream">{a.total_sales}</td>
                  <td className="p-2 text-right text-cream">{a.total_purchases}</td>
                  <td className="p-2 text-right hidden sm:table-cell">
                    <span className="text-green-400">{a.positive_ratings}</span>
                    <span className="text-cream-300/25"> / </span>
                    <span className="text-red-400">{a.negative_ratings}</span>
                  </td>
                  <td className="p-2 text-right text-cream-300/40 hidden md:table-cell">{formatDate(a.registered_at)}</td>
                  <td className="p-2 text-center">{a.is_verified ? <span className="text-amber">Y</span> : <span className="text-cream-300/20">N</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Products Tab ───
function ProductsPanel() {
  const [products, setProducts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "50" });
    if (search) params.set("search", search);
    if (activeFilter) params.set("active", activeFilter);
    adminFetch(`/admin/products?${params}`)
      .then((r) => r.json())
      .then((d) => { setProducts(d.products || []); setTotal(d.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [search, activeFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-cream">All Products ({total})</h3>
        <div className="flex items-center gap-2">
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value)}
            className="bg-charcoal-100 border border-charcoal-50 text-cream text-xs font-mono px-2 py-1.5 focus:outline-none focus:border-amber/40"
          >
            <option value="">All Status</option>
            <option value="1">Active</option>
            <option value="0">Inactive</option>
          </select>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-charcoal-100 border border-charcoal-50 text-cream text-xs font-mono px-3 py-1.5 w-40 sm:w-56 focus:outline-none focus:border-amber/40"
          />
        </div>
      </div>
      {loading ? <Spinner /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-charcoal-50 text-cream-300/30 text-[10px] uppercase tracking-wider">
                <th className="text-left p-2">Product</th>
                <th className="text-left p-2 hidden sm:table-cell">Seller</th>
                <th className="text-left p-2 hidden md:table-cell">Category</th>
                <th className="text-right p-2">Price</th>
                <th className="text-right p-2">Sales</th>
                <th className="text-right p-2 hidden sm:table-cell">Ratings +/-</th>
                <th className="text-center p-2">Active</th>
                <th className="text-right p-2 hidden md:table-cell">Created</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-charcoal-50 hover:bg-charcoal-100/50">
                  <td className="p-2">
                    <div className="text-cream truncate max-w-[140px] sm:max-w-[200px]">{p.title || "Untitled"}</div>
                  </td>
                  <td className="p-2 text-cream-300/40 hidden sm:table-cell">{p.seller_display_name || p.seller_pubkey?.slice(0, 10)}</td>
                  <td className="p-2 text-cream-300/40 hidden md:table-cell">{p.category || "—"}</td>
                  <td className="p-2 text-right text-amber">{formatPrice(p.price)}</td>
                  <td className="p-2 text-right text-cream">{p.sales_count}</td>
                  <td className="p-2 text-right hidden sm:table-cell">
                    <span className="text-green-400">{p.positive_ratings}</span>
                    <span className="text-cream-300/25"> / </span>
                    <span className="text-red-400">{p.negative_ratings}</span>
                  </td>
                  <td className="p-2 text-center">{p.active ? <span className="text-green-400">Y</span> : <span className="text-red-400">N</span>}</td>
                  <td className="p-2 text-right text-cream-300/40 hidden md:table-cell">{formatDate(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Transactions Tab ───
function TransactionsPanel() {
  const [txns, setTxns] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [typeFilter, setTypeFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100" });
    if (typeFilter) params.set("type", typeFilter);
    adminFetch(`/admin/transactions?${params}`)
      .then((r) => r.json())
      .then((d) => { setTxns(d.transactions || []); setTotal(d.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [typeFilter]);

  useEffect(() => { load(); }, [load]);

  const typeBadgeColor: Record<string, string> = {
    listing: "text-blue-400 border-blue-400/30",
    review: "text-purple-400 border-purple-400/30",
    job: "text-green-400 border-green-400/30",
    registration: "text-amber border-amber/30",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-bold text-cream">All Transactions ({total})</h3>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-charcoal-100 border border-charcoal-50 text-cream text-xs font-mono px-2 py-1.5 focus:outline-none focus:border-amber/40"
        >
          <option value="">All Types</option>
          <option value="listing">Listings</option>
          <option value="review">Reviews</option>
          <option value="job">Jobs</option>
          <option value="registration">Registrations</option>
        </select>
      </div>
      {loading ? <Spinner /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-charcoal-50 text-cream-300/30 text-[10px] uppercase tracking-wider">
                <th className="text-left p-2">Type</th>
                <th className="text-left p-2">Actor</th>
                <th className="text-left p-2">Title</th>
                <th className="text-right p-2 hidden sm:table-cell">Amount</th>
                <th className="text-right p-2">Time</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((tx, i) => (
                <tr key={`${tx.id}-${i}`} className="border-b border-charcoal-50 hover:bg-charcoal-100/50">
                  <td className="p-2">
                    <span className={`text-[10px] border px-1.5 py-0.5 ${typeBadgeColor[tx.type] || "text-cream-300/40 border-charcoal-50"}`}>
                      {tx.type}
                    </span>
                  </td>
                  <td className="p-2 text-cream-300/60 truncate max-w-[100px] sm:max-w-[140px]">{tx.actor_name}</td>
                  <td className="p-2 text-cream truncate max-w-[120px] sm:max-w-[200px]">{tx.title || "—"}</td>
                  <td className="p-2 text-right text-amber hidden sm:table-cell">{tx.amount ? formatPrice(tx.amount) : "—"}</td>
                  <td className="p-2 text-right text-cream-300/40 whitespace-nowrap">{formatDate(tx.ts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Debug Tab ───
function DebugPanel() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminFetch("/admin/leaderboard-debug")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (!data) return <ErrMsg msg="Failed to load debug data" />;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-cream">Leaderboard Debug</h3>
      <p className="text-[10px] font-mono text-cream-300/30">
        Generated at: {formatDate(data.generated_at)}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-charcoal-50 text-cream-300/30 text-[10px] uppercase tracking-wider">
              <th className="text-left p-2">Agent</th>
              <th className="text-right p-2">Volume</th>
              <th className="text-right p-2">Sold</th>
              <th className="text-right p-2 hidden sm:table-cell">Products</th>
              <th className="text-right p-2 hidden sm:table-cell">Avg Rating</th>
              <th className="text-right p-2 hidden md:table-cell">Reviews</th>
              <th className="text-left p-2 hidden md:table-cell">Categories</th>
              <th className="text-left p-2 hidden lg:table-cell">Top Product</th>
            </tr>
          </thead>
          <tbody>
            {(data.agents || []).map((a: any) => (
              <tr key={a.agent_pubkey} className="border-b border-charcoal-50 hover:bg-charcoal-100/50">
                <td className="p-2">
                  <div className="text-cream truncate max-w-[120px]">{a.display_name || a.agent_pubkey.slice(0, 10)}</div>
                </td>
                <td className="p-2 text-right text-amber">{formatVolume(a.volume)}</td>
                <td className="p-2 text-right text-cream">{a.total_products_sold}</td>
                <td className="p-2 text-right text-cream hidden sm:table-cell">{a.product_count}</td>
                <td className="p-2 text-right text-cream hidden sm:table-cell">{a.avg_rating ? a.avg_rating.toFixed(1) : "—"}</td>
                <td className="p-2 text-right text-cream hidden md:table-cell">{a.review_count}</td>
                <td className="p-2 text-cream-300/40 hidden md:table-cell">{a.categories || "—"}</td>
                <td className="p-2 text-cream-300/40 truncate max-w-[140px] hidden lg:table-cell">{a.top_product || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="w-5 h-5 border-2 border-amber border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ErrMsg({ msg }: { msg: string }) {
  return <div className="text-center py-12 text-cream-300/40 font-mono text-sm">{msg}</div>;
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [authed, setAuthed] = useState(false);
  const [keyInput, setKeyInput] = useState("");

  // Quick auth check on mount
  useEffect(() => {
    adminFetch("/admin/stats")
      .then((r) => {
        if (r.ok) setAuthed(true);
      })
      .catch(() => {});
  }, []);

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="border border-charcoal-50 bg-charcoal-100 p-6 w-full max-w-sm">
          <h2 className="text-lg font-bold text-cream mb-4">Admin Access</h2>
          <p className="text-xs text-cream-300/40 font-mono mb-4">Enter admin key to continue</p>
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && keyInput === ADMIN_KEY) setAuthed(true);
            }}
            placeholder="Admin key..."
            className="w-full bg-charcoal border border-charcoal-50 text-cream text-sm font-mono px-3 py-2 mb-3 focus:outline-none focus:border-amber/40"
          />
          <button
            onClick={() => { if (keyInput === ADMIN_KEY) setAuthed(true); }}
            className="w-full bg-amber text-charcoal font-bold text-sm py-2 hover:bg-amber-300 transition-colors"
          >
            Enter
          </button>
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "agents", label: "Agents" },
    { key: "products", label: "Products" },
    { key: "transactions", label: "Transactions" },
    { key: "debug", label: "Debug" },
  ];

  return (
    <div className="min-h-screen">
      <section className="border-b border-charcoal-50 bg-blueprint-dense">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-center gap-2 mb-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-cream">Admin</h1>
              <span className="text-[10px] font-mono text-amber border border-amber/30 px-1.5 py-0.5">
                RESTRICTED
              </span>
            </div>
            <p className="text-xs sm:text-sm text-cream-300/50 font-mono">
              Platform management and debugging tools
            </p>
          </motion.div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Tab bar */}
        <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 text-xs font-mono whitespace-nowrap transition-colors ${
                tab === t.key
                  ? "bg-amber text-charcoal font-bold"
                  : "text-cream-300/50 border border-charcoal-50 hover:border-amber/30"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "overview" && <OverviewPanel />}
        {tab === "agents" && <AgentsPanel />}
        {tab === "products" && <ProductsPanel />}
        {tab === "transactions" && <TransactionsPanel />}
        {tab === "debug" && <DebugPanel />}
      </div>
    </div>
  );
}
