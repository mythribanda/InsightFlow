import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function MetricCard({
  label, value, hint, accent, icon: Icon, className,
}: {
  label: string; value: React.ReactNode; hint?: string;
  accent?: "primary" | "accent" | "success" | "warning" | "destructive";
  icon?: LucideIcon;
  className?: string;
}) {
  const accentColor: Record<string, string> = {
    primary: "text-primary",
    accent: "text-accent",
    success: "text-[color:var(--color-success)]",
    warning: "text-[color:var(--color-warning)]",
    destructive: "text-destructive",
  };
  const accentBg: Record<string, string> = {
    primary: "bg-primary/10",
    accent: "bg-accent/10",
    success: "bg-[color:var(--color-success)]/10",
    warning: "bg-[color:var(--color-warning)]/10",
    destructive: "bg-destructive/10",
  };
  return (
    <div className={cn("surface-card group relative overflow-hidden p-4 transition-all duration-300 hover:scale-[1.02]", className)}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className={cn("mt-2 text-2xl font-bold tabular-nums", accent && accentColor[accent])}>{value}</div>
          {hint && <div className="mt-1.5 text-[11px] text-muted-foreground">{hint}</div>}
        </div>
        {Icon && (
          <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110", accent && accentBg[accent])}>
            <Icon className={cn("h-4.5 w-4.5", accent && accentColor[accent])} />
          </div>
        )}
      </div>
    </div>
  );
}
