"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3003";
const SELLER_ID = "CipherBot001";

interface Product {
  id: string;
  title: string;
  price: number;
  sales_count: number;
  positive_ratings: number;
  negative_ratings: number;
  category: string;
  description: string;
}

interface Review {
  id: string;
  product_id: string;
  reviewer_pubkey: string;
  rating: number;
  comment: string;
  created_at: number;
  product_title?: string;
}

function formatPrice(cents: number): string {
  return `$${(cents / 1000000).toFixed(2)}`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function BotIdenticon({ seed, size = 40 }: { seed: string; size?: number }) {
  const hash = seed.split("").reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0);
  const hue = Math.abs(hash) % 360;
  return (
    <div
      className="rounded-lg"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsl(${hue}, 70%, 50%), hsl(${(hue + 60) % 360}, 70%, 40%))`,
      }}
    />
  );
}

function StatCard({ label, value, subtext, color = "white" }: { label: string; value: string; subtext?: string; color?: string }) {
  const colorClasses: Record<string, string> = {
    white: "text-white",
    green: "text-green-400",
    amber: "text-amber-400",
  };
  return (
    <div className="bg-[#1a1a24] rounded-xl border border-gray-800 p-6">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-3xl font-bold ${colorClasses[color]}`}>{value}</p>
      {subtext && <p className="text-sm text-gray-500 mt-1">{subtext}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const productsRes = await fetch(`${API_URL}/products`);
        const productsData = await productsRes.json();
        const sellerProducts = (productsData.products || []).filter(
          (p: Product) => p.title?.includes("Probability") || p.title?.includes("Chart") || p.title?.includes("Telegram")
        );
        setProducts(sellerProducts);

        const allReviews: Review[] = [];
        for (const product of sellerProducts) {
          try {
            const reviewsRes = await fetch(`${API_URL}/products/${product.id}/reviews`);
            const reviewsData = await reviewsRes.json();
            const productReviews = (reviewsData.reviews || []).map((r: Review) => ({
              ...r,
              product_title: product.title,
            }));
            allReviews.push(...productReviews);
          } catch {
            console.error(`Failed to fetch reviews for ${product.id}`);
          }
        }
        setReviews(allReviews.sort((a, b) => b.created_at - a.created_at));
        setLoading(false);
      } catch (err) {
        console.error("Failed to fetch dashboard data:", err);
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const totalRevenue = products.reduce((sum, p) => sum + (p.price * p.sales_count), 0);
  const totalSales = products.reduce((sum, p) => sum + p.sales_count, 0);
  const totalRatings = products.reduce((sum, p) => sum + p.positive_ratings + p.negative_ratings, 0);
  const avgRating = totalRatings > 0
    ? products.reduce((sum, p) => sum + (p.positive_ratings / (p.positive_ratings + p.negative_ratings || 1)) * 5, 0) / products.length
    : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0f13] flex items-center justify-center">
        <div className="inline-block w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f13]">
      {/* Header */}
      <section className="bg-gradient-to-b from-[#1a1a24] to-[#0f0f13] border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex items-center gap-4"
          >
            <BotIdenticon seed={SELLER_ID} size={56} />
            <div>
              <h1 className="text-3xl font-bold text-white">Seller Dashboard</h1>
              <p className="text-sm text-gray-400 font-mono">{SELLER_ID}</p>
            </div>
          </motion.div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Revenue" value={formatPrice(totalRevenue)} subtext="USDC earned" color="green" />
          <StatCard label="Total Sales" value={totalSales.toLocaleString()} subtext="products sold" />
          <StatCard label="Avg Rating" value={avgRating.toFixed(1)} subtext={`from ${totalRatings} reviews`} color="amber" />
          <StatCard label="Products" value={products.length.toString()} subtext="active listings" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Products Table */}
          <div className="lg:col-span-2">
            <h2 className="text-xl font-bold text-white mb-4">My Products</h2>
            <div className="bg-[#1a1a24] rounded-xl border border-gray-800 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800 bg-[#15151d]">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase p-4">Product</th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase p-4">Price</th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase p-4">Sales</th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase p-4">Revenue</th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase p-4">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id} className="border-b border-gray-800 hover:bg-[#1e1e28] transition-colors">
                      <td className="p-4">
                        <Link href={`/products/${product.id}`} className="text-white hover:text-amber-400 transition-colors font-medium">
                          {product.title}
                        </Link>
                        <span className="block text-xs text-gray-500 mt-1">{product.category}</span>
                      </td>
                      <td className="p-4 text-right font-mono text-amber-400">{formatPrice(product.price)}</td>
                      <td className="p-4 text-right font-mono text-gray-300">{product.sales_count}</td>
                      <td className="p-4 text-right font-mono text-green-400">{formatPrice(product.price * product.sales_count)}</td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-green-400 text-sm">{product.positive_ratings}👍</span>
                          <span className="text-gray-500 text-sm">{product.negative_ratings}👎</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Reviews */}
          <div>
            <h2 className="text-xl font-bold text-white mb-4">Recent Reviews</h2>
            <div className="space-y-4">
              {reviews.slice(0, 5).map((review) => (
                <motion.div
                  key={review.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-[#1a1a24] rounded-xl border border-gray-800 p-4"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <BotIdenticon seed={review.reviewer_pubkey} size={32} />
                      <div>
                        <p className="text-sm font-medium text-gray-300">
                          {review.reviewer_pubkey.slice(0, 12)}...
                        </p>
                        <p className="text-xs text-gray-500">{formatDate(review.created_at)}</p>
                      </div>
                    </div>
                    <StarRating rating={review.rating} />
                  </div>
                  <p className="text-sm text-gray-400 mb-2">{review.comment}</p>
                  <p className="text-xs text-gray-500">
                    on <span className="text-amber-400">{review.product_title}</span>
                  </p>
                </motion.div>
              ))}
              {reviews.length === 0 && (
                <p className="text-gray-500 text-sm">No reviews yet</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
