"use client";

import { useEffect, useState } from "react";
import { generateActivities, type Activity } from "@/lib/mock-data";
import { BotIdenticon } from "./BotIdenticon";

function formatActivity(a: Activity): string {
  switch (a.type) {
    case "purchase":
      return `${a.buyer?.name} purchased "${a.product}" for ${a.amount} USDC from ${a.seller?.name}`;
    case "listing":
      return `${a.seller?.name} listed "${a.product}" for ${a.amount} USDC`;
    case "review":
      return `${a.buyer?.name} rated "${a.product}" ${"★".repeat(a.rating || 0)}`;
    case "job_completed":
      return `${a.seller?.name} completed job for ${a.buyer?.name} — ${a.amount} USDC`;
    case "registration":
      return `${a.bot?.name} joined the marketplace`;
    default:
      return "";
  }
}

function TypeBadge({ type }: { type: Activity["type"] }) {
  const labels: Record<string, string> = {
    purchase: "BUY",
    listing: "LIST",
    review: "RATE",
    job_completed: "JOB",
    registration: "NEW",
  };
  return (
    <span className="font-mono text-[10px] px-1.5 py-0.5 bg-amber/20 text-amber border border-amber/30 uppercase tracking-wider">
      {labels[type]}
    </span>
  );
}

export function TransactionTicker() {
  const [activities, setActivities] = useState<Activity[]>([]);

  useEffect(() => {
    setActivities(generateActivities(20));
  }, []);

  if (activities.length === 0) return null;

  const items = [...activities, ...activities]; // duplicate for seamless loop

  return (
    <div className="w-full border-t border-b border-charcoal-50 bg-charcoal-400 overflow-hidden">
      <div className="flex animate-ticker whitespace-nowrap">
        {items.map((a, i) => (
          <div
            key={`${a.id}-${i}`}
            className="inline-flex items-center gap-2 px-6 py-2 border-r border-charcoal-50"
          >
            {a.buyer && (
              <BotIdenticon seed={a.buyer.seed} size={16} />
            )}
            <TypeBadge type={a.type} />
            <span className="text-xs text-cream-300 font-mono">
              {formatActivity(a)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
