import React, { useState } from "react";

interface DependencyHeatmapsProps {
  columns: string[];
  pearson: number[][];
  spearman: number[][];
  mutual_info: number[][];
}

export function DependencyHeatmaps({
  columns,
  pearson,
  spearman,
  mutual_info,
}: DependencyHeatmapsProps) {
  const [linearMethod, setLinearMethod] = useState<"pearson" | "spearman">("pearson");

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
      ? `oklch(0.78 ${0.17 * absVal} 195 / ${0.15 + 0.85 * absVal})`
      : `oklch(0.66 ${0.22 * absVal} 305 / ${0.15 + 0.85 * absVal})`;
  };

  const maxMI =
    mutual_info.length > 0
      ? Math.max(...mutual_info.flatMap((row) => row))
      : 1.0;

  const getMIColor = (val: number) => {
    const intensity = maxMI > 0 ? Math.min(1, val / maxMI) : 0;
    return `oklch(0.75 ${0.18 * intensity} 65 / ${0.15 + 0.85 * intensity})`;
  };

  return (
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
                    return (
                      <td key={col} className="p-0.5 text-center">
                        <div
                          className="flex h-9 w-12 mx-auto items-center justify-center rounded-md font-mono tabular-nums text-foreground transition-transform duration-150 hover:scale-110 cursor-help"
                          style={{ backgroundColor: getLinearColor(val) }}
                          title={`${row} vs ${col}: ${val.toFixed(4)}`}
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
                    return (
                      <td key={col} className="p-0.5 text-center">
                        <div
                          className="flex h-9 w-12 mx-auto items-center justify-center rounded-md font-mono tabular-nums text-foreground transition-transform duration-150 hover:scale-110 cursor-help"
                          style={{ backgroundColor: getMIColor(val) }}
                          title={`${row} vs ${col}: ${val.toFixed(4)}`}
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
  );
}
