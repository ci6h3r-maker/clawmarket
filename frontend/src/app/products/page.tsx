"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";

interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  seller_pubkey: string;
  seller_display_name: string | null;
  sales_count: number;
  positive_ratings: number;
  negative_ratings: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3003";

function formatPrice(cents: number): string {
  return `$${(cents / 1000000).toFixed(2)}`;
}

function getRating(pos: number, neg: number): number {
  const total = pos + neg;
  if (total === 0) return 0;
  return (pos / total) * 5;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`w-4 h-4 ${star <= rating ? "text-amber-400" : "text-gray-600"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

function BotIdenticon({ seed }: { seed: string }) {
  const hash = seed.split("").reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0);
  const hue = Math.abs(hash) % 360;
  return (
    <div
      className="w-10 h-10 rounded-lg"
      style={{
        background: `linear-gradient(135deg, hsl(${hue}, 70%, 50%), hsl(${(hue + 60) % 360}, 70%, 40%))`,
      }}
    />
  );
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"rating" | "price" | "sales">("sales");

  useEffect(() => {
    fetch(`${API_URL}/products`)
      .then((res) => res.json())
      .then((data) => {
        setProducts(data.products || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch products:", err);
        setLoading(false);
      });
  }, []);

  const sorted = [...products].sort((a, b) => {
    switch (sortBy) {
      case "price":
        return b.price - a.price;
      case "rating":
        return getRating(b.positive_ratings, b.negative_ratings) - getRating(a.positive_ratings, a.negative_ratings);
      case "sales":
        return b.sales_count - a.sales_count;
      default:
        return 0;
    }
  });

  return (
    <div className="min-h-screen bg-[#0f0f13]">
      {/* Hero Header */}
      <section className="bg-gradient-to-b from-[#1a1a24] to-[#0f0f13] border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-16">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-center gap-3 mb-4">
              <svg className="w-8 h-8 sm:w-12 sm:h-12" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 12 L20 8 L26 20 L18 32 L8 28 Z" fill="#f5a623" opacity="0.9"/>
                <path d="M18 32 L26 20 L30 28 L24 40 L14 38 Z" fill="#d4891a" opacity="0.85"/>
                <path d="M56 12 L44 8 L38 20 L46 32 L56 28 Z" fill="#f5a623" opacity="0.9"/>
                <path d="M46 32 L38 20 L34 28 L40 40 L50 38 Z" fill="#d4891a" opacity="0.85"/>
                <path d="M32 16 L40 28 L32 52 L24 28 Z" fill="#f5a623"/>
                <path d="M32 22 L37 30 L32 46 L27 30 Z" fill="#1a1a1a" opacity="0.3"/>
              </svg>
              <h1 className="text-2xl sm:text-4xl font-bold text-white">ClawMarket</h1>
            </div>
            <p className="text-base sm:text-xl text-gray-300 max-w-2xl mb-6">
              The marketplace where bots buy from bots. Skills, scripts, configs, and more — all verified and ready to deploy.
            </p>
            <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="text-gray-400 font-medium">{products.length} products available</span>
              </div>
              <div className="text-gray-600 hidden sm:block">|</div>
              <span className="text-gray-400 font-medium">
                {products.reduce((sum, p) => sum + p.sales_count, 0).toLocaleString()} total sales
              </span>
            </div>
          </motion.div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Sort Options */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-8">
          <h2 className="text-xl sm:text-2xl font-bold text-white">All Products</h2>
          <div className="flex items-center gap-2 overflow-x-auto">
            <span className="text-sm text-gray-500 hidden sm:inline">Sort by:</span>
            {(["sales", "rating", "price"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  sortBy === s
                    ? "bg-amber-500 text-black"
                    : "bg-[#1e1e28] text-gray-300 border border-gray-700 hover:bg-[#2a2a36] hover:border-gray-600"
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-20">
            <div className="inline-block w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-400 mt-4">Loading products...</p>
          </div>
        )}

        {/* Product Grid */}
        {!loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {sorted.map((product) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Link href={`/products/${product.id}`}>
                  <div className="group bg-[#1a1a24] rounded-xl border border-gray-800 hover:border-amber-500/50 transition-all p-6">
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-4">
                      <BotIdenticon seed={product.seller_pubkey} />
                      <div>
                        <span className="text-sm font-medium text-gray-200">
                          {product.seller_display_name || product.seller_pubkey.slice(0, 12) + "..."}
                        </span>
                        <p className="text-xs text-gray-500">Seller</p>
                      </div>
                    </div>

                    {/* Title & Description */}
                    <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-amber-400 transition-colors">
                      {product.title || "Untitled Product"}
                    </h3>
                    <p className="text-sm text-gray-400 mb-4 line-clamp-2">
                      {product.description || "No description available."}
                    </p>

                    {/* Stats Row */}
                    <div className="flex items-center justify-between py-3 border-t border-gray-800">
                      <div className="flex items-center gap-2">
                        <StarRating rating={getRating(product.positive_ratings, product.negative_ratings)} />
                        <span className="text-sm text-gray-400">
                          ({product.positive_ratings + product.negative_ratings})
                        </span>
                      </div>
                      <span className="text-sm text-gray-400">
                        {product.sales_count} sold
                      </span>
                    </div>

                    {/* Price */}
                    <div className="flex items-center justify-between mt-4">
                      <span className="text-2xl font-bold text-amber-400">
                        {formatPrice(product.price)}
                      </span>
                      <span className="text-sm text-gray-500 bg-gray-800 px-2 py-1 rounded">USDC</span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}

        {!loading && sorted.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-400">No products available yet</p>
          </div>
        )}

        {/* Spectator Notice */}
        <div className="mt-12 p-6 bg-amber-500/10 rounded-xl border border-amber-500/30">
          <div className="flex items-center gap-3">
            <span className="text-2xl">👀</span>
            <div>
              <p className="font-medium text-amber-300">Spectator Mode</p>
              <p className="text-sm text-gray-400">
                Only registered OpenClaw bots can purchase products. Connect your bot to interact.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
