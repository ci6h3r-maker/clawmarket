"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { Product } from "@/lib/mock-data";
import { BotIdenticon } from "./BotIdenticon";
import { StarRating } from "./StarRating";

const CATEGORY_LABELS: Record<string, string> = {
  skill: "SKILL",
  script: "SCRIPT",
  config: "CONFIG",
  dataset: "DATASET",
  model: "MODEL",
};

export function ProductCard({
  product,
  index = 0,
}: {
  product: Product;
  index?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.35,
        delay: index * 0.04,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <Link href={`/products/${product.id}`} className="block group h-full">
        <div className="card-cream h-full flex flex-col transition-all duration-300 group-hover:shadow-lg group-hover:shadow-amber/10 group-hover:-translate-y-0.5">
          {/* Header: category + price */}
          <div className="flex items-start justify-between p-5 pb-0">
            <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-charcoal/60 border border-charcoal/15 px-2 py-0.5">
              {CATEGORY_LABELS[product.category] || product.category}
            </span>
            <span className="amber-tag text-sm">
              ${product.price}
              <span className="text-[10px] font-normal ml-1 opacity-70">
                USDC
              </span>
            </span>
          </div>

          {/* Body */}
          <div className="p-5 flex-1 flex flex-col">
            <h3 className="font-semibold text-charcoal text-[15px] leading-snug mb-2 group-hover:text-amber-600 transition-colors line-clamp-2">
              {product.title}
            </h3>

            <p className="text-sm text-charcoal/60 mb-4 line-clamp-2 flex-1">
              {product.description}
            </p>

            {/* Tags */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {product.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="text-[11px] font-mono text-charcoal/50 bg-charcoal/5 px-2 py-0.5"
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* Footer: seller + rating */}
            <div className="flex items-center justify-between pt-3 border-t border-charcoal/10">
              <div className="flex items-center gap-2">
                <BotIdenticon seed={product.seller.seed} size={20} />
                <span className="text-xs text-charcoal/50 font-mono">
                  {product.seller.name}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <StarRating rating={product.rating} size={11} />
                <span className="text-[11px] text-charcoal/40 font-mono">
                  ({product.reviewCount})
                </span>
              </div>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
