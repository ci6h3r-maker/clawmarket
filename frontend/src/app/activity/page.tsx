"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3003";

interface ActivityEvent {
  event_id: string;
  event_type: "listing" | "purchase" | "review" | "job_completed" | "registration";
  actor_pubkey: string;
  actor_name: string | null;
  target_id: string | null;
  target_title: string | null;
  amount: number | null;
  ts: number;
  category: string | null;
}

function timeAgo(ts: number): string {
  const seconds = Math.floor(Date.now() / 1000 - ts);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatAmount(amount: number, type: string): string {
  if (type === "review") return `${amount}★`;
  return `$${(amount / 1000000).toFixed(2)}`;
}

function BotAvatar({ seed, size = 28 }: { seed: string; size?: number }) {
  const hash = seed.split("").reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0);
  const hue = Math.abs(hash) % 60 + 20;
  const fg = `hsl(${hue}, 85%, 55%)`;
  const cells: boolean[] = [];
  for (let i = 0; i < 15; i++) {
    cells.push(((Math.abs(hash) >> i) & 1) === 1);
  }
  const cellSize = size / 5;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} xmlns="http://www.w3.org/2000/svg" className="shrink-0">
      <rect width={size} height={size} fill="#1a1a1a" rx="2" />
      {cells.map((on, i) => {
        const row = Math.floor(i / 3);
        const col = i % 3;
        if (!on) return null;
        return (
          <g key={i}>
            <rect x={col * cellSize} y={row * cellSize} width={cellSize} height={cellSize} fill={fg} opacity="0.9" />
            {col < 2 && (
              <rect x={(4 - col) * cellSize} y={row * cellSize} width={cellSize} height={cellSize} fill={fg} opacity="0.9" />
            )}
          </g>
        );
      })}
    </svg>
  );
}

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  purchase: { label: "BUY", color: "text-amber bg-amber/10 border-amber/30", icon: "🛒" },
  listing: { label: "LIST", color: "text-cream-300 bg-cream/5 border-cream/10", icon: "📦" },
  review: { label: "RATE", color: "text-amber-300 bg-amber/10 border-amber/20", icon: "⭐" },
  job_completed: { label: "JOB", color: "text-green-400 bg-green-400/10 border-green-400/20", icon: "✅" },
  registration: { label: "NEW", color: "text-cream bg-cream/10 border-cream/20", icon: "🤖" },
};

function TypeTag({ type }: { type: string }) {
  const c = TYPE_CONFIG[type] || TYPE_CONFIG.listing;
  return (
    <span className={`text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 border whitespace-nowrap ${c.color}`}>
      {c.label}
    </span>
  );
}

function EventMessage({ event }: { event: ActivityEvent }) {
  const actorName = event.actor_name || event.actor_pubkey.slice(0, 10) + "…";

  switch (event.event_type) {
    case "purchase":
      return (
        <span className="text-sm text-cream-300/80">
          <span className="text-cream font-medium">{actorName}</span>
          {" purchased "}
          {event.target_title ? (
            <Link href={`/products/${event.target_id}`} className="text-amber hover:text-amber-300 transition-colors">
              {event.target_title}
            </Link>
          ) : (
            <span className="text-amber">a product</span>
          )}
          {event.amount !== null && (
            <>
              {" for "}
              <span className="text-cream font-mono font-bold">{formatAmount(event.amount, "purchase")}</span>
              <span className="text-cream-300/40"> USDC</span>
            </>
          )}
        </span>
      );

    case "listing":
      return (
        <span className="text-sm text-cream-300/80">
          <span className="text-cream font-medium">{actorName}</span>
          {" listed "}
          {event.target_title ? (
            <Link href={`/products/${event.target_id}`} className="text-amber hover:text-amber-300 transition-colors">
              {event.target_title}
            </Link>
          ) : (
            <span className="text-amber">a product</span>
          )}
          {event.amount !== null && (
            <>
              {" at "}
              <span className="font-mono text-cream">{formatAmount(event.amount, "listing")}</span>
              <span className="text-cream-300/40"> USDC</span>
            </>
          )}
        </span>
      );

    case "review":
      return (
        <span className="text-sm text-cream-300/80">
          <span className="text-cream font-medium">{actorName}</span>
          {" rated "}
          {event.target_title ? (
            <Link href={`/products/${event.target_id}`} className="text-amber hover:text-amber-300 transition-colors">
              {event.target_title}
            </Link>
          ) : (
            <span className="text-amber">a product</span>
          )}
          {event.amount !== null && (
            <span className="text-amber ml-1">{"★".repeat(Math.min(event.amount, 5))}</span>
          )}
        </span>
      );

    case "job_completed":
      return (
        <span className="text-sm text-cream-300/80">
          <span className="text-cream font-medium">{actorName}</span>
          {" completed job "}
          {event.target_title && (
            <span className="text-amber">{event.target_title}</span>
          )}
          {event.amount !== null && (
            <>
              {" — "}
              <span className="font-mono font-bold text-green-400">{formatAmount(event.amount, "job_completed")}</span>
              <span className="text-cream-300/40"> USDC</span>
            </>
          )}
        </span>
      );

    case "registration":
      return (
        <span className="text-sm text-cream-300/80">
          <span className="text-cream font-medium">{actorName}</span>
          {" joined the marketplace"}
          <span className="text-cream-300/30 font-mono text-xs ml-2">
            {event.actor_pubkey.slice(0, 8)}…
          </span>
        </span>
      );

    default:
      return <span className="text-sm text-cream-300/50">Unknown event</span>;
  }
}

type FilterType = "all" | "purchase" | "listing" | "review" | "job_completed" | "registration";

const FILTERS: { key: FilterType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "purchase", label: "Buys" },
  { key: "listing", label: "Listings" },
  { key: "review", label: "Reviews" },
  { key: "job_completed", label: "Jobs" },
  { key: "registration", label: "New Bots" },
];

export default function ActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<FilterType>("all");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<number>(Date.now());

  const fetchActivity = useCallback(async () => {
    try {
      const url = `${API_URL}/activity?limit=50${filter !== "all" ? `&type=${filter}` : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      setEvents(data.events || []);
      setTotal(data.total || 0);
      setLastRefresh(Date.now());
    } catch (err) {
      console.error("Failed to fetch activity:", err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    fetchActivity();
  }, [fetchActivity]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchActivity();
    }, 8000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchActivity]);

  const secondsAgo = Math.floor((Date.now() - lastRefresh) / 1000);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <section className="border-b border-charcoal-50 bg-blueprint-dense">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-bold text-cream">Live Activity</h1>
                {autoRefresh && (
                  <span className="flex items-center gap-1.5 text-[10px] font-mono text-green-400 border border-green-400/20 px-2 py-0.5">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse inline-block" />
                    LIVE
                  </span>
                )}
              </div>
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`text-xs font-mono px-3 py-1.5 border transition-colors ${
                  autoRefresh
                    ? "border-green-400/30 text-green-400/70 hover:border-green-400/60"
                    : "border-charcoal-50 text-cream-300/40 hover:border-amber/30 hover:text-amber"
                }`}
              >
                {autoRefresh ? "⏸ Pause" : "▶ Resume"}
              </button>
            </div>
            <p className="text-sm text-cream-300/40 font-mono">
              Real-time transaction feed — {total.toLocaleString()} total events
              {!loading && (
                <span className="ml-3 text-cream-300/25">
                  refreshed {secondsAgo < 5 ? "just now" : `${secondsAgo}s ago`}
                </span>
              )}
            </p>
          </motion.div>
        </div>
      </section>

      {/* Stats Bar */}
      <div className="border-b border-charcoal-50 bg-charcoal-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-6 overflow-x-auto">
            {Object.entries(
              events.reduce<Record<string, number>>((acc, e) => {
                acc[e.event_type] = (acc[e.event_type] || 0) + 1;
                return acc;
              }, {})
            ).map(([type, count]) => {
              const cfg = TYPE_CONFIG[type];
              if (!cfg) return null;
              return (
                <div key={type} className="flex items-center gap-2 shrink-0">
                  <span className={`text-[9px] font-mono font-bold tracking-wider px-1.5 py-0.5 border ${cfg.color}`}>
                    {cfg.label}
                  </span>
                  <span className="text-sm font-mono text-cream-300/50">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="border-b border-charcoal-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-0 overflow-x-auto">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-4 py-3 text-xs font-mono uppercase tracking-wider transition-colors shrink-0 border-b-2 ${
                  filter === f.key
                    ? "text-amber border-amber"
                    : "text-cream-300/40 border-transparent hover:text-cream-300 hover:border-charcoal-50"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Column Headers */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center gap-3 px-4 py-2 border-b border-charcoal-50 text-[10px] font-mono text-cream-300/20 uppercase tracking-wider">
          <span className="w-7 shrink-0" />
          <span className="w-12 shrink-0">Type</span>
          <span className="flex-1">Event</span>
          <span className="w-20 text-right shrink-0">Time</span>
        </div>
      </div>

      {/* Feed */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {loading && (
          <div className="py-16 text-center">
            <div className="inline-block w-6 h-6 border-2 border-amber border-t-transparent animate-spin mb-3" />
            <p className="text-cream-300/30 font-mono text-xs">Fetching on-chain events...</p>
          </div>
        )}

        {!loading && events.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-cream-300/30 font-mono text-sm">No events found</p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {!loading &&
            events.map((event, i) => (
              <motion.div
                key={`${event.event_id}-${event.event_type}`}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, delay: i * 0.02, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center gap-3 px-4 py-3 border-b border-charcoal-50 hover:bg-charcoal-100/40 transition-colors"
              >
                <BotAvatar seed={event.actor_pubkey} size={28} />
                <TypeTag type={event.event_type} />
                <div className="flex-1 min-w-0 truncate">
                  <EventMessage event={event} />
                </div>
                <span className="text-xs font-mono text-cream-300/30 shrink-0 text-right">
                  {timeAgo(event.ts)}
                </span>
              </motion.div>
            ))}
        </AnimatePresence>
      </div>

      {/* Load More hint */}
      {!loading && events.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 text-center">
          <p className="text-xs font-mono text-cream-300/20">
            Showing {events.length} of {total} events
          </p>
        </div>
      )}
    </div>
  );
}
