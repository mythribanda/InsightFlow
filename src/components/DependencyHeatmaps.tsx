import React, { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getVisualization } from "@/server/visualize";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from "recharts";
import {
  X,
  TrendingUp,
  BarChart3,
  Sparkles,
  HelpCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MetricCard } from "@/components/MetricCard";

interface DependencyHeatmapsProps {
  columns: string[];
  pearson: number[][];
  spearman: number[][];
  mutual_info: number[][];
  sessionId?: string;
}

export function DependencyHeatmaps({
  columns,
  pearson,
  spearman,
  mutual_info,
  sessionId,
}: DependencyHeatmapsProps) {
  const [linearMethod, setLinearMethod] = useState<"pearson" | "spearman">("pearson");
  const [selectedPair, setSelectedPair] = useState<{
    x: string;
    y: string;
    pearsonVal: number;
    miVal: number;
  } | null>(null);

  const runGetVisualization = useServerFn(getVisualization);

  const { data: vizResult, isLoading: isVizLoading, error: vizError } = useQuery({
    queryKey: ["viz_scatter", sessionId, selectedPair?.x, selectedPair?.y],
    queryFn: async () => {
      if (!selectedPair || !sessionId) return null;
      return runGetVisualization({
        data: {
          session_id: sessionId,
          column1: selectedPair.x,
          column2: selectedPair.y,
          chart_type: "scatter",
        },
      });
    },
    enabled: !!selectedPair && !!sessionId,
  });

  if (!columns || columns.length === 0) {
    return (
      <div className="surface-card p-6 text-center text-muted-foreground">
        No numeric columns available for dependency analysis.
      </div>
    );
  }

  const linearMatrix = linearMethod === "pearson" ? pearson : spearman;

  const getLinearColor = (val: number) => {
    const absVal = Math.min(1, Math.abs(val));
    return val >= 0
      ? `oklch(0.78 0.17 195 / ${0.15 + 0.85 * absVal})`
      : `oklch(0.66 0.22 305 / ${0.15 + 0.85 * absVal})`;
  };

  const maxMI =
    mutual_info.length > 0
      ? Math.max(...mutual_info.flatMap((row) => row))
      : 1.0;

  const getMIColor = (val: number) => {
    const intensity = maxMI > 0 ? Math.min(1, val / maxMI) : 0;
    return `oklch(0.75 0.18 65 / ${0.15 + 0.85 * intensity})`;
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Linear Correlation Heatmap */}
        <div className="surface-card p-5 flex flex-col">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Linear Correlation</h3>
              <p className="text-[11px] text-muted-foreground">
                {linearMethod === "pearson" ? "Pearson (linear)" : "Spearman (monotonic)"} (cyan = positive, violet = negative)
              </p>
            </div>
            <div className="flex rounded-lg bg-secondary/50 p-0.5 border border-border">
              <button
                onClick={() => setLinearMethod("pearson")}
                className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors ${
                  linearMethod === "pearson"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Pearson
              </button>
              <button
                onClick={() => setLinearMethod("spearman")}
                className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors ${
                  linearMethod === "spearman"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Spearman
              </button>
            </div>
          </div>

          <div className="overflow-auto custom-scrollbar">
            <table className="w-full border-collapse text-[10px]">
              <thead>
                <tr>
                  <th className="sticky top-0 left-0 z-10 bg-background/80 backdrop-blur-sm p-1.5 w-24"></th>
                  {columns.map((col) => (
                    <th
                      key={col}
                      className="sticky top-0 bg-background/80 backdrop-blur-sm px-1.5 py-1 text-center font-normal text-muted-foreground truncate max-w-[80px]"
                      title={col}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {columns.map((row, i) => (
                  <tr key={row} className="hover:bg-primary/[0.02]">
                    <td
                      className="sticky left-0 bg-background/80 backdrop-blur-sm pr-3 py-1.5 text-right font-medium text-muted-foreground truncate max-w-[96px]"
                      title={row}
                    >
                      {row}
                    </td>
                    {columns.map((col, j) => {
                      const val = linearMatrix[i]?.[j] ?? 0;
                      const miVal = mutual_info[i]?.[j] ?? 0;
                      return (
                        <td key={col} className="p-0.5 text-center">
                          <div
                            onClick={() => i !== j && setSelectedPair({ x: row, y: col, pearsonVal: val, miVal })}
                            className={`flex h-9 w-12 mx-auto items-center justify-center rounded-md font-mono tabular-nums text-foreground transition-transform duration-150 hover:scale-110 ${
                              i === j ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                            }`}
                            style={{ backgroundColor: getLinearColor(val) }}
                            title={i === j ? `${row} self-correlation` : `Click to explore: ${row} vs ${col} (r = ${val.toFixed(4)})`}
                          >
                            {val.toFixed(2)}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mutual Information Heatmap */}
        <div className="surface-card p-5 flex flex-col">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-foreground">Predictive Dependency</h3>
            <p className="text-[11px] text-muted-foreground">
              Mutual Information (nonlinear predictive relationships in sunset/orange)
            </p>
          </div>

          <div className="overflow-auto custom-scrollbar">
            <table className="w-full border-collapse text-[10px]">
              <thead>
                <tr>
                  <th className="sticky top-0 left-0 z-10 bg-background/80 backdrop-blur-sm p-1.5 w-24"></th>
                  {columns.map((col) => (
                    <th
                      key={col}
                      className="sticky top-0 bg-background/80 backdrop-blur-sm px-1.5 py-1 text-center font-normal text-muted-foreground truncate max-w-[80px]"
                      title={col}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {columns.map((row, i) => (
                  <tr key={row} className="hover:bg-primary/[0.02]">
                    <td
                      className="sticky left-0 bg-background/80 backdrop-blur-sm pr-3 py-1.5 text-right font-medium text-muted-foreground truncate max-w-[96px]"
                      title={row}
                    >
                      {row}
                    </td>
                    {columns.map((col, j) => {
                      const val = mutual_info[i]?.[j] ?? 0;
                      const pearsonVal = pearson[i]?.[j] ?? 0;
                      return (
                        <td key={col} className="p-0.5 text-center">
                          <div
                            onClick={() => i !== j && setSelectedPair({ x: row, y: col, pearsonVal, miVal: val })}
                            className={`flex h-9 w-12 mx-auto items-center justify-center rounded-md font-mono tabular-nums text-foreground transition-transform duration-150 hover:scale-110 ${
                              i === j ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                            }`}
                            style={{ backgroundColor: getMIColor(val) }}
                            title={i === j ? `${row} self-dependence` : `Click to explore: ${row} vs ${col} (MI = ${val.toFixed(4)})`}
                          >
                            {val.toFixed(2)}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Explorer Details Panel */}
      {selectedPair && (
        <Card className="border-violet-500/20 bg-gradient-to-br from-violet-950/5 via-transparent to-transparent animate-in slide-in-from-bottom-3 duration-300">
          <CardHeader className="pb-3 border-b border-border/60 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-400" />
                Relationship Explorer: {selectedPair.x} vs {selectedPair.y}
              </CardTitle>
              <CardDescription>
                Examine correlation, predictive strength, and shape.
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={() => setSelectedPair(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid gap-6 md:grid-cols-3">
              {/* Left Column: Stats & Insight */}
              <div className="space-y-4 md:col-span-1 text-left flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <MetricCard
                      label="Pearson Corr"
                      value={selectedPair.pearsonVal.toFixed(3)}
                      accent={Math.abs(selectedPair.pearsonVal) > 0.4 ? "primary" : "warning"}
                    />
                    <MetricCard
                      label="Mutual Info"
                      value={selectedPair.miVal.toFixed(3)}
                      accent={selectedPair.miVal > 0.1 ? "accent" : "warning"}
                    />
                  </div>

                  <div className="rounded-lg border border-border p-4 bg-muted/20">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <HelpCircle className="h-3.5 w-3.5 text-violet-400" />
                      Statistical Insight
                    </h4>
                    {isVizLoading ? (
                      <div className="flex items-center gap-2 py-4">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Analyzing pair...</span>
                      </div>
                    ) : vizError ? (
                      <p className="text-xs text-destructive">
                        Failed to load relationship insight.
                      </p>
                    ) : (
                      <p className="text-xs leading-relaxed text-foreground">
                        {vizResult?.insight || "Generating relationship interpretation..."}
                      </p>
                    )}
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-2"
                  onClick={() => setSelectedPair(null)}
                >
                  Close Explorer
                </Button>
              </div>

              {/* Right Column: Scatter Plot Chart */}
              <div className="md:col-span-2 flex flex-col justify-center min-h-[300px] border border-border/80 rounded-lg p-4 bg-muted/5 relative">
                {isVizLoading ? (
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-xs text-muted-foreground font-mono">Drawing scatter plot...</p>
                  </div>
                ) : vizError ? (
                  <div className="flex flex-col items-center justify-center space-y-2 text-destructive">
                    <AlertCircle className="h-8 w-8" />
                    <p className="text-xs font-mono">Failed to load scatter plot data.</p>
                  </div>
                ) : !vizResult || vizResult.data.length === 0 ? (
                  <div className="text-center text-xs text-muted-foreground font-mono">
                    No data points found for this pair.
                  </div>
                ) : (
                  <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
                        <CartesianGrid stroke="var(--color-grid)" strokeDasharray="3 3" />
                        <XAxis
                          dataKey={selectedPair.x}
                          name={selectedPair.x}
                          tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }}
                          type="number"
                          domain={["auto", "auto"]}
                        />
                        <YAxis
                          dataKey={selectedPair.y}
                          name={selectedPair.y}
                          tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }}
                          type="number"
                          domain={["auto", "auto"]}
                        />
                        <RechartsTooltip cursor={{ strokeDasharray: "3 3" }} />
                        <Scatter
                          name={`${selectedPair.x} vs ${selectedPair.y}`}
                          data={vizResult.data}
                          fill="var(--color-primary)"
                        />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
