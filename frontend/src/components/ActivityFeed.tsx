"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Activity } from "@/lib/mock-data";
import { generateActivities } from "@/lib/mock-data";
import { BotIdenticon } from "./BotIdenticon";

function timeAgo(ts: string): string {
  const seconds = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function TypeTag({ type }: { type: Activity["type"] }) {
  const config: Record<string, { label: string; color: string }> = {
    purchase: { label: "BUY", color: "text-amber bg-amber/10 border-amber/30" },
    listing: { label: "LIST", color: "text-cream-300 bg-cream/5 border-cream/10" },
    review: { label: "RATE", color: "text-amber-300 bg-amber/10 border-amber/20" },
    job_completed: { label: "JOB", color: "text-green-400 bg-green-400/10 border-green-400/20" },
    registration: { label: "NEW", color: "text-cream bg-cream/10 border-cream/20" },
  };
  const c = config[type] || config.purchase;
  return (
    <span
      className={`text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 border ${c.color}`}
    >
      {c.label}
    </span>
  );
}

function ActivityMessage({ activity }: { activity: Activity }) {
  switch (activity.type) {
    case "purchase":
      return (
        <span className="text-sm text-cream-300">
          <span className="text-cream font-medium">{activity.buyer?.name}</span>
          {" purchased "}
          <span className="text-amber">{activity.product}</span>
          {" for "}
          <span className="text-cream font-mono font-bold">
            ${activity.amount}
          </span>
          <span className="text-cream-300/50"> USDC</span>
        </span>
      );
    case "listing":
      return (
        <span className="text-sm text-cream-300">
          <span className="text-cream font-medium">
            {activity.seller?.name}
          </span>
          {" listed "}
          <span className="text-amber">{activity.product}</span>
          {" for $"}
          <span className="font-mono">{activity.amount}</span>
        </span>
      );
    case "review":
      return (
        <span className="text-sm text-cream-300">
          <span className="text-cream font-medium">
            {activity.buyer?.name}
          </span>
          {" rated "}
          <span className="text-amber">{activity.product}</span>{" "}
          <span className="text-amber">
            {"★".repeat(activity.rating || 0)}
          </span>
        </span>
      );
    case "job_completed":
      return (
        <span className="text-sm text-cream-300">
          <span className="text-cream font-medium">
            {activity.seller?.name}
          </span>
          {" completed job for "}
          <span className="text-cream font-medium">
            {activity.buyer?.name}
          </span>
          {" — "}
          <span className="font-mono font-bold text-cream">
            ${activity.amount}
          </span>
        </span>
      );
    case "registration":
      return (
        <span className="text-sm text-cream-300">
          <span className="text-cream font-medium">
            {activity.bot?.name}
          </span>
          {" joined the marketplace"}
        </span>
      );
  }
}

export function ActivityFeed({
  limit = 20,
}: {
  limit?: number;
}) {
  const [activities, setActivities] = useState<Activity[]>([]);

  useEffect(() => {
    setActivities(generateActivities(limit));

    const interval = setInterval(() => {
      setActivities((prev) => {
        const newAct = generateActivities(1)[0];
        newAct.id = `act-live-${Date.now()}`;
        newAct.timestamp = new Date().toISOString();
        return [newAct, ...prev.slice(0, limit - 1)];
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [limit]);

  return (
    <div className="space-y-0">
      <AnimatePresence initial={false}>
        {activities.map((activity) => {
          const bot = activity.buyer || activity.seller || activity.bot;
          return (
            <motion.div
              key={activity.id}
              initial={{ opacity: 0, x: -16, height: 0 }}
              animate={{ opacity: 1, x: 0, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{
                duration: 0.3,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="flex items-center gap-3 px-4 py-3 border-b border-charcoal-50 hover:bg-charcoal-100/50 transition-colors"
            >
              {bot && <BotIdenticon seed={bot.seed} size={28} />}
              <TypeTag type={activity.type} />
              <div className="flex-1 min-w-0 truncate">
                <ActivityMessage activity={activity} />
              </div>
              <span className="text-xs font-mono text-cream-300/40 shrink-0">
                {timeAgo(activity.timestamp)}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
