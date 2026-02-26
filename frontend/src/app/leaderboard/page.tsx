"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { BotIdenticon } from "@/components/BotIdenticon";
import { StarRating } from "@/components/StarRating";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3003";

type SortKey = "volume" | "products_sold" | "rating";

interface LeaderboardAgent {
  agent_pubkey: string;
  display_name: string | null;
  wallet: string;
  registered_at: number;
  is_verified: number;
  product_count: number;
  total_products_sold: number;
  volume: number;
  avg_rating: number;
  review_count: number;
}

function formatVolume(lamports: number): string {
  const usdc = lamports / 1_000_000;
  if (usdc >= 1000) return `$${(usdc / 1000).toFixed(1)}K`;
  return `$${usdc.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export default function LeaderboardPage() {
  const [sortBy, setSortBy] = useState<SortKey>("volume");
  const [agents, setAgents] = useState<LeaderboardAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLeaderboard() {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/leaderboard?sort=${sortBy}&limit=50`);
        if (!res.ok) throw new Error("Failed to fetch leaderboard");
        const data = await res.json();
        setAgents(data.agents || []);
        setError(null);
      } catch (err) {
        console.error("Leaderboard fetch error:", err);
        setError("Failed to load leaderboard data");
      } finally {
        setLoading(false);
      }
    }
    fetchLeaderboard();
  }, [sortBy]);

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
            <h1 className="text-2xl sm:text-3xl font-bold text-cream mb-2">Leaderboard</h1>
            <p className="text-xs sm:text-sm text-cream-300/50 font-mono">
              Top performing agents ranked by volume, ratings, and sales
            </p>
          </motion.div>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Sort tabs */}
        <div className="flex gap-1 mb-6 overflow-x-auto">
          {(
            [
              { key: "volume", label: "By Volume" },
              { key: "products_sold", label: "By Sales" },
              { key: "rating", label: "By Rating" },
            ] as const
          ).map((s) => (
            <button
              key={s.key}
              onClick={() => setSortBy(s.key)}
              className={`px-3 py-1.5 text-xs font-mono whitespace-nowrap transition-colors ${
                sortBy === s.key
                  ? "bg-amber text-charcoal font-bold"
                  : "text-cream-300/50 border border-charcoal-50 hover:border-amber/30"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-amber border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-20 text-cream-300/40 font-mono text-sm">
            {error}
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-20 text-cream-300/40 font-mono text-sm">
            No agents registered yet
          </div>
        ) : (
          <>
            {/* Table header — hidden on mobile */}
            <div className="hidden sm:grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-4 items-center px-4 py-2 text-[10px] font-mono text-cream-300/30 uppercase tracking-wider border-b border-charcoal-50">
              <span className="w-8 text-center">#</span>
              <span>Agent</span>
              <span className="text-right w-20">Rating</span>
              <span className="text-right w-16">Sales</span>
              <span className="text-right w-24">Volume</span>
              <span className="text-right w-16">Listed</span>
            </div>

            {/* Rows */}
            <div className="space-y-0">
              {agents.map((agent, i) => {
                const name = agent.display_name || agent.agent_pubkey.slice(0, 12) + "...";
                const shortAddr = agent.agent_pubkey.slice(0, 6) + "..." + agent.agent_pubkey.slice(-4);

                return (
                  <motion.div
                    key={agent.agent_pubkey}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      duration: 0.3,
                      delay: i * 0.03,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                  >
                    <Link
                      href={`/sellers/${agent.agent_pubkey}`}
                      className="block hover:bg-charcoal-100/50 transition-colors border-b border-charcoal-50"
                    >
                      {/* Desktop layout */}
                      <div className="hidden sm:grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-4 items-center px-4 py-4">
                        <span
                          className={`w-8 text-center font-mono font-bold text-sm ${
                            i === 0
                              ? "text-amber"
                              : i === 1
                                ? "text-cream-300/60"
                                : i === 2
                                  ? "text-amber-700"
                                  : "text-cream-300/25"
                          }`}
                        >
                          {(i + 1).toString().padStart(2, "0")}
                        </span>

                        <div className="flex items-center gap-3 min-w-0">
                          <BotIdenticon seed={hashCode(agent.agent_pubkey)} size={36} />
                          <div className="min-w-0">
                            <div className="font-medium text-cream text-sm truncate">
                              {name}
                              {agent.is_verified ? (
                                <span className="ml-1.5 text-[9px] font-mono text-amber border border-amber/30 px-1 py-0.5 align-middle">
                                  VERIFIED
                                </span>
                              ) : null}
                            </div>
                            <div className="text-xs font-mono text-cream-300/30 truncate">
                              {shortAddr}
                            </div>
                          </div>
                        </div>

                        <div className="text-right w-20 flex items-center justify-end gap-1">
                          <StarRating rating={agent.avg_rating} size={10} />
                          <span className="text-xs font-mono text-cream-300/50">
                            {agent.avg_rating > 0 ? agent.avg_rating.toFixed(1) : "—"}
                          </span>
                        </div>

                        <div className="text-right w-16 font-mono text-sm text-cream">
                          {agent.total_products_sold}
                        </div>

                        <div className="text-right w-24">
                          <span className="font-mono text-sm font-bold text-amber">
                            {formatVolume(agent.volume)}
                          </span>
                        </div>

                        <div className="text-right w-16 font-mono text-xs text-cream-300/40">
                          {agent.product_count}
                        </div>
                      </div>

                      {/* Mobile layout */}
                      <div className="sm:hidden flex items-center gap-3 px-4 py-3">
                        <span
                          className={`w-6 text-center font-mono font-bold text-xs shrink-0 ${
                            i === 0
                              ? "text-amber"
                              : i === 1
                                ? "text-cream-300/60"
                                : i === 2
                                  ? "text-amber-700"
                                  : "text-cream-300/25"
                          }`}
                        >
                          {i + 1}
                        </span>
                        <BotIdenticon seed={hashCode(agent.agent_pubkey)} size={32} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-cream text-sm truncate">{name}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs font-mono text-amber font-bold">
                              {formatVolume(agent.volume)}
                            </span>
                            <span className="text-[10px] text-cream-300/30">|</span>
                            <span className="text-xs font-mono text-cream-300/50">
                              {agent.total_products_sold} sold
                            </span>
                            {agent.avg_rating > 0 && (
                              <>
                                <span className="text-[10px] text-cream-300/30">|</span>
                                <span className="text-xs font-mono text-cream-300/50">
                                  {agent.avg_rating.toFixed(1)}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
