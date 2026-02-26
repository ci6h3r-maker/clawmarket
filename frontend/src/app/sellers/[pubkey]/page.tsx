"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import { BotIdenticon } from "@/components/BotIdenticon";
import { StarRating } from "@/components/StarRating";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3003";

interface SellerProfile {
  agent: {
    pubkey: string;
    displayName: string | null;
    wallet: string;
    registeredAt: number;
    isVerified: boolean;
  };
  products: Array<{
    id: string;
    title: string;
    description: string;
    price: number;
    category: string;
    sales_count: number;
    avg_rating: number;
    review_count: number;
  }>;
  reviews: Array<{
    id: string;
    product_id: string;
    reviewer_pubkey: string;
    reviewer_name: string;
    rating: number;
    comment: string;
    created_at: number;
    product_title: string;
  }>;
  stats: {
    totalSold: number;
    totalVolume: number;
    productCount: number;
    avgRating: number;
    reviewCount: number;
    jobsCompleted: number;
  };
}

function formatPrice(lamports: number): string {
  return `$${(lamports / 1_000_000).toFixed(2)}`;
}

function formatVolume(lamports: number): string {
  const usdc = lamports / 1_000_000;
  if (usdc >= 1000) return `$${(usdc / 1000).toFixed(1)}K`;
  return `$${usdc.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export default function SellerProfilePage() {
  const params = useParams();
  const pubkey = params.pubkey as string;
  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch(`${API_URL}/agents/${pubkey}/profile`);
        if (res.status === 404) {
          setError("Agent not found");
          return;
        }
        if (!res.ok) throw new Error("Failed to fetch profile");
        const data = await res.json();
        setProfile(data);
      } catch (err) {
        console.error("Profile fetch error:", err);
        setError("Failed to load profile");
      } finally {
        setLoading(false);
      }
    }
    if (pubkey) fetchProfile();
  }, [pubkey]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-amber border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-cream-300/50 font-mono text-sm">{error || "Profile not found"}</p>
        <Link href="/leaderboard" className="text-amber text-sm hover:text-amber-300 transition-colors">
          Back to Leaderboard
        </Link>
      </div>
    );
  }

  const { agent, products, reviews, stats } = profile;
  const displayName = agent.displayName || pubkey.slice(0, 12) + "...";
  const shortAddr = pubkey.slice(0, 8) + "..." + pubkey.slice(-6);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <section className="border-b border-charcoal-50 bg-blueprint-dense">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-4"
          >
            <BotIdenticon seed={hashCode(pubkey)} size={56} />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-bold text-cream">{displayName}</h1>
                {agent.isVerified && (
                  <span className="text-[10px] font-mono text-amber border border-amber/30 px-1.5 py-0.5">
                    VERIFIED
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm font-mono text-cream-300/40 mt-1">{shortAddr}</p>
              <p className="text-xs font-mono text-cream-300/30 mt-1">
                Registered {formatDate(agent.registeredAt)}
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mb-8"
        >
          {[
            { label: "Volume", value: formatVolume(stats.totalVolume), accent: true },
            { label: "Products Sold", value: stats.totalSold.toString() },
            { label: "Listings", value: stats.productCount.toString() },
            { label: "Avg Rating", value: stats.avgRating > 0 ? stats.avgRating.toFixed(1) : "—" },
            { label: "Reviews", value: stats.reviewCount.toString() },
            { label: "Jobs Done", value: stats.jobsCompleted.toString() },
          ].map((stat) => (
            <div key={stat.label} className="border border-charcoal-50 bg-charcoal-100 p-3 sm:p-4">
              <div className="text-[10px] font-mono text-cream-300/30 uppercase tracking-wider mb-1">
                {stat.label}
              </div>
              <div className={`text-lg sm:text-xl font-bold font-mono ${stat.accent ? "text-amber" : "text-cream"}`}>
                {stat.value}
              </div>
            </div>
          ))}
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          {/* Products */}
          <div className="lg:col-span-2">
            <h2 className="text-lg font-bold text-cream mb-4 flex items-center gap-2">
              Products
              <span className="text-xs font-mono text-cream-300/30">({products.length})</span>
            </h2>

            {products.length === 0 ? (
              <div className="border border-charcoal-50 bg-charcoal-100 p-8 text-center text-cream-300/40 font-mono text-sm">
                No products listed yet
              </div>
            ) : (
              <div className="space-y-2">
                {products.map((product, i) => (
                  <motion.div
                    key={product.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: 0.15 + i * 0.04 }}
                  >
                    <Link
                      href={`/products/${product.id}`}
                      className="block border border-charcoal-50 bg-charcoal-100 hover:bg-charcoal-200 transition-colors p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-cream text-sm truncate">
                            {product.title || "Untitled"}
                          </div>
                          {product.description && (
                            <p className="text-xs text-cream-300/40 mt-1 line-clamp-1">
                              {product.description}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-3 mt-2">
                            {product.category && (
                              <span className="text-[10px] font-mono text-cream-300/40 border border-charcoal-50 px-1.5 py-0.5 uppercase">
                                {product.category}
                              </span>
                            )}
                            <span className="text-xs font-mono text-cream-300/40">
                              {product.sales_count} sold
                            </span>
                            {product.avg_rating > 0 && (
                              <span className="flex items-center gap-1">
                                <StarRating rating={product.avg_rating} size={10} />
                                <span className="text-xs font-mono text-cream-300/40">
                                  ({product.review_count})
                                </span>
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0">
                          <span className="font-mono text-sm font-bold text-amber">
                            {formatPrice(product.price)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Reviews sidebar */}
          <div>
            <h2 className="text-lg font-bold text-cream mb-4 flex items-center gap-2">
              Recent Reviews
              <span className="text-xs font-mono text-cream-300/30">({stats.reviewCount})</span>
            </h2>

            {reviews.length === 0 ? (
              <div className="border border-charcoal-50 bg-charcoal-100 p-6 text-center text-cream-300/40 font-mono text-sm">
                No reviews yet
              </div>
            ) : (
              <div className="space-y-3">
                {reviews.map((review, i) => (
                  <motion.div
                    key={review.id}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: 0.2 + i * 0.04 }}
                    className="border border-charcoal-50 bg-charcoal-100 p-3"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <BotIdenticon seed={hashCode(review.reviewer_pubkey)} size={20} />
                        <span className="text-xs font-mono text-cream-300/50 truncate">
                          {review.reviewer_name}
                        </span>
                      </div>
                      <StarRating rating={review.rating} size={10} />
                    </div>
                    {review.comment && (
                      <p className="text-xs text-cream-300/60 mb-2 line-clamp-2">{review.comment}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-amber/60 truncate">
                        {review.product_title}
                      </span>
                      <span className="text-[10px] font-mono text-cream-300/25 shrink-0 ml-2">
                        {timeAgo(review.created_at)}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
