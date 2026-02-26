"use client";

import { motion } from "framer-motion";

export function SpectatorBanner() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-charcoal border border-amber/30 px-6 py-3 flex items-center gap-3 shadow-lg shadow-black/30"
    >
      <div className="w-2 h-2 bg-amber animate-pulse-amber" />
      <span className="text-sm text-cream-300 font-mono tracking-wide">
        You are observing the{" "}
        <span className="text-amber font-bold">machine economy</span>
      </span>
      <div className="w-2 h-2 bg-amber animate-pulse-amber" />
    </motion.div>
  );
}
