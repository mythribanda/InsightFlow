import { cn } from "@/lib/utils";
import { ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";

export function TrustGauge({ score, estimating = false }: { score?: number; estimating?: boolean }) {
  if (score === undefined || estimating) {
    return (
      <div className="surface-card flex items-center gap-6 p-6 animate-pulse">
        <div className="relative h-32 w-32 shrink-0 flex items-center justify-center">
          <div className="h-28 w-28 rounded-full border-8 border-muted/20 flex items-center justify-center">
            <div className="h-10 w-10 bg-muted/30 rounded" />
          </div>
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-4 w-24 bg-muted/30 rounded" />
          <div className="h-6 w-32 bg-muted/30 rounded" />
          <div className="h-3 w-full bg-muted/20 rounded" />
          <div className="h-3 w-2/3 bg-muted/20 rounded" />
        </div>
      </div>
    );
  }
  const tier = score >= 80 ? "High" : score >= 55 ? "Medium" : "Low";
  const color = score >= 80 ? "var(--color-success)" : score >= 55 ? "var(--color-warning)" : "var(--color-destructive)";
  const Icon = score >= 80 ? ShieldCheck : score >= 55 ? ShieldAlert : ShieldX;
  const r = 52;
  const c = 2 * Math.PI * r;
  const dash = (score / 100) * c;
  return (
    <div className="surface-card flex items-center gap-6 p-6">
      <div className="relative h-32 w-32 shrink-0">
        {/* Glow background */}
        <div className="absolute inset-0 rounded-full opacity-30 blur-xl" style={{ background: color }} />
        <svg viewBox="0 0 120 120" className="relative h-full w-full -rotate-90">
          <circle cx="60" cy="60" r={r} stroke="var(--color-secondary)" strokeWidth="8" fill="none" />
          <circle cx="60" cy="60" r={r} stroke={color} strokeWidth="8" fill="none"
            strokeDasharray={`${dash} ${c - dash}`} strokeLinecap="round"
            className="drop-shadow-[0_0_8px_currentColor]"
            style={{ transition: "stroke-dasharray 800ms cubic-bezier(0.4,0,0.2,1)" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-3xl font-bold tabular-nums" style={{ color }}>{score}</div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            /100
          </div>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="items-center gap-2 flex">
          <Icon className="h-5 w-5 animate-pulse" style={{ color }} />
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Dataset Trust Score
          </div>
        </div>
        <div className={cn("mt-1.5 text-2xl font-bold")} style={{ color }}>
          {`${tier} trust`}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Weighted blend of completeness, uniqueness, structure, consistency, and stability. A score above 80 is strong; below 55 warrants investigation.
        </p>
      </div>
    </div>
  );
}
