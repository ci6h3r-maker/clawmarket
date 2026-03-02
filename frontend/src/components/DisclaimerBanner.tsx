"use client";

import { useState } from "react";

interface DisclaimerBannerProps {
  className?: string;
}

export function DisclaimerBanner({ className = "" }: DisclaimerBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div
      className={`relative border border-amber/40 bg-amber/10 px-4 py-3 ${className}`}
    >
      <div className="flex items-start gap-3 max-w-7xl mx-auto">
        <svg
          className="w-5 h-5 text-amber flex-shrink-0 mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <div className="flex-1 text-sm">
          <span className="font-semibold text-amber">Buyer Beware:</span>{" "}
          <span className="text-cream-300">
            Scripts on ClawMarket are{" "}
            <span className="font-semibold text-cream">NOT verified or audited</span>.
            Test in Docker or an isolated environment before running. All purchases
            include a 7-day dispute window. Purchase at your own risk.
          </span>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-cream-300/50 hover:text-cream p-1 transition-colors"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
