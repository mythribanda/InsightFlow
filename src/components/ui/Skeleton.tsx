import React from "react";
import { cn } from "@/lib/utils";

/**
 * Skeleton — pulsing placeholder for loading states.
 *
 * Drop-in for any content shape. Uses CSS `animate-pulse` + a subtle gradient
 * shimmer aligned with the existing glassmorphism palette (muted/20 → muted/10).
 *
 * Usage:
 *   <Skeleton className="h-4 w-48" />           // one line of text
 *   <Skeleton className="h-32 w-full rounded-xl" /> // card body
 */
interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md",
        "bg-gradient-to-r from-muted/30 via-muted/15 to-muted/30",
        className
      )}
      style={style}
      aria-hidden="true"
    />
  );
}

/* -----------------------------------------------------------------------
 * Composed skeleton layouts for specific panel shapes
 * --------------------------------------------------------------------- */

/** A single card header: title bar + description bar */
export function SkeletonCardHeader() {
  return (
    <div className="space-y-2 p-6 pb-2">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-3.5 w-64" />
    </div>
  );
}

/** Generic tall card body — used for AnomalyPanel, ExperimentHistory, etc. */
export function SkeletonCardBody({ rows = 5 }: { rows?: number }) {
  return (
    <div className="p-6 pt-4 space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3 items-center">
          <Skeleton className="h-4 flex-1" style={{ width: `${60 + (i % 3) * 15}%` }} />
          <Skeleton className="h-4 w-16 shrink-0" />
          <Skeleton className="h-4 w-12 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** Feature-recommendation block (used in ModelingPanel recommendations pending) */
export function SkeletonFeatureBuckets() {
  return (
    <div className="space-y-4 my-4">
      {["High Signal", "Low Signal", "Leakage Risk"].map((label) => (
        <div key={label}>
          <Skeleton className="h-4 w-28 mb-2" />
          <div className="flex flex-wrap gap-2">
            {[80, 64, 96, 56, 72].map((w, i) => (
              <Skeleton key={i} className="h-6 rounded-full" style={{ width: w }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Metric grid — 3 cards side by side */
export function SkeletonMetricGrid({ cols = 3 }: { cols?: number }) {
  return (
    <div className={`grid grid-cols-${cols} gap-4`}>
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="p-4 rounded-lg border border-border bg-card/20 space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-2 w-full" />
        </div>
      ))}
    </div>
  );
}

/** Table rows skeleton */
export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-0">
      {/* Header */}
      <div className={`grid gap-3 px-4 py-2 border-b border-border`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-full" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, ri) => (
        <div
          key={ri}
          className="grid gap-3 px-4 py-2.5 border-b border-border/50"
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        >
          {Array.from({ length: cols }).map((_, ci) => (
            <Skeleton key={ci} className="h-3.5" style={{ width: `${50 + Math.sin(ri + ci) * 30}%` }} />
          ))}
        </div>
      ))}
    </div>
  );
}
