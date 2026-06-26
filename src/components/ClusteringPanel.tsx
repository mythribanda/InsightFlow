import React, { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { runClustering, type ClusteringResponse } from "@/server/clustering";
import { type DatasetProfile } from "@/lib/profiler";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from "recharts";
import { Target, AlertTriangle, Layers, Activity, HelpCircle, Info } from "lucide-react";

interface ClusteringPanelProps {
  sessionId: string;
  profile: DatasetProfile;
}

export const ClusteringPanel: React.FC<ClusteringPanelProps> = ({ sessionId, profile }) => {
  const executeClustering = useServerFn(runClustering);

  const numericCols = profile?.columns.filter(c => c.type === "numeric").map(c => c.name) || [];

  const [selectedCols, setSelectedCols] = useState<string[]>(numericCols.slice(0, 2));
  const [method, setMethod] = useState<"kmeans" | "dbscan">("kmeans");
  const [nClusters, setNClusters] = useState(3);
  const [eps, setEps] = useState(0.5);
  const [minSamples, setMinSamples] = useState(5);

  const [result, setResult] = useState<ClusteringResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleRun = async () => {
    if (selectedCols.length < 2) {
      setError("Please select at least 2 numeric columns for clustering.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await executeClustering({
        data: {
          session_id: sessionId,
          columns: selectedCols,
          method,
          n_clusters: nClusters,
          eps,
          min_samples: minSamples,
        }
      });
      setResult(res);
    } catch (err: any) {
      setError(err.message || "Clustering run failed.");
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const getColorForCluster = (cluster: number) => {
    if (cluster === -1) return "#64748b"; // Muted Slate Gray for DBSCAN noise
    const colors = [
      "#0ea5e9", // Cyan/Primary
      "#a855f7", // Purple/Accent
      "#ec4899", // Pink
      "#3b82f6", // Blue
      "#10b981", // Emerald
      "#f59e0b", // Amber
      "#ef4444", // Red
      "#84cc16", // Lime
      "#06b6d4", // Cyan
      "#6366f1"  // Indigo
    ];
    return colors[cluster % colors.length];
  };

  const hasMultipleDimensions = selectedCols.length > 2;

  return (
    <div className="space-y-6">
      <Card className="border border-border bg-card/60 backdrop-blur-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-white">
                <Target className="h-5 w-5 text-primary" />
                Unsupervised Clustering
              </CardTitle>
              <CardDescription>
                Partition your data using K-Means or discover density-based clusters using DBSCAN.
              </CardDescription>
            </div>
            {result && (
              <Badge variant="outline" className="px-3 py-1 text-xs border-primary/30 bg-primary/10 text-primary">
                {result.n_clusters_found} Clusters Found
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Settings Section */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Columns Select */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Select Columns to Cluster (Min 2)
                </label>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Only numeric fields are eligible. Selected fields will be Standardized prior to clustering.
                </p>
              </div>

              {numericCols.length < 2 ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Insufficient Columns</AlertTitle>
                  <AlertDescription>
                    Clustering requires at least 2 numeric columns. This dataset only contains {numericCols.length}.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[160px] overflow-y-auto border border-border bg-background/55 rounded-lg p-3 scrollbar-thin">
                  {numericCols.map((col) => (
                    <label
                      key={col}
                      className="flex items-center gap-2.5 text-xs font-mono text-slate-300 hover:text-white cursor-pointer select-none py-1 truncate"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCols.includes(col)}
                        onChange={() => {
                          setSelectedCols((prev) =>
                            prev.includes(col)
                              ? prev.filter((c) => c !== col)
                              : [...prev, col]
                          );
                        }}
                        className="rounded border-slate-700 bg-slate-900 text-primary focus:ring-primary h-4 w-4"
                      />
                      <span className="truncate" title={col}>{col}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Algorithm Settings */}
            <div className="space-y-4 border-l border-border/40 pl-0 md:pl-6">
              {/* Method Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Clustering Method
                </label>
                <div className="flex gap-2 p-1 rounded-lg bg-secondary/35 border border-border/60 w-fit">
                  <button
                    type="button"
                    onClick={() => setMethod("kmeans")}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold font-mono tracking-wide transition-all ${
                      method === "kmeans"
                        ? "bg-primary text-primary-foreground shadow"
                        : "text-muted-foreground hover:text-white"
                    }`}
                  >
                    K-Means
                  </button>
                  <button
                    type="button"
                    onClick={() => setMethod("dbscan")}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold font-mono tracking-wide transition-all ${
                      method === "dbscan"
                        ? "bg-primary text-primary-foreground shadow"
                        : "text-muted-foreground hover:text-white"
                    }`}
                  >
                    DBSCAN
                  </button>
                </div>
              </div>

              {/* Dynamic Inputs */}
              {method === "kmeans" ? (
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1">
                      <span className="text-slate-300">Number of Clusters (K)</span>
                      <span className="text-primary font-mono font-bold">{nClusters}</span>
                    </div>
                    <input
                      type="range"
                      min="2"
                      max="20"
                      value={nClusters}
                      onChange={(e) => setNClusters(parseInt(e.target.value))}
                      className="w-full accent-primary bg-slate-800 rounded-lg h-2 cursor-pointer"
                    />
                    <span className="text-[9px] text-muted-foreground block mt-1">
                      Partitions data into exactly K distinct groups based on centroid distance.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* DBSCAN EPS Slider */}
                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1">
                      <span className="text-slate-300">Epsilon (eps)</span>
                      <span className="text-primary font-mono font-bold">{eps.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.05"
                      max="5.0"
                      step="0.05"
                      value={eps}
                      onChange={(e) => setEps(parseFloat(e.target.value))}
                      className="w-full accent-primary bg-slate-800 rounded-lg h-2 cursor-pointer"
                    />
                    <span className="text-[9px] text-muted-foreground block mt-1">
                      Maximum distance between two samples for one to be considered as in the neighborhood of the other.
                    </span>
                  </div>

                  {/* DBSCAN Min Samples Slider */}
                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1">
                      <span className="text-slate-300">Min Samples</span>
                      <span className="text-primary font-mono font-bold">{minSamples}</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="50"
                      value={minSamples}
                      onChange={(e) => setMinSamples(parseInt(e.target.value))}
                      className="w-full accent-primary bg-slate-800 rounded-lg h-2 cursor-pointer"
                    />
                    <span className="text-[9px] text-muted-foreground block mt-1">
                      Number of samples in a neighborhood for a point to be considered as a core point.
                    </span>
                  </div>
                </div>
              )}

              {/* Run Trigger */}
              <Button
                onClick={handleRun}
                disabled={busy || selectedCols.length < 2}
                className="w-full font-semibold"
              >
                {busy ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent mr-1" />
                ) : (
                  <Activity className="h-4 w-4 mr-1.5" />
                )}
                {busy ? "Clustering..." : "Run Clustering"}
              </Button>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Clustering Failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Results Plot & Insights */}
          {result && (
            <div className="space-y-6 pt-6 border-t border-border/40">
              <div className="grid gap-6 lg:grid-cols-3">
                {/* Insights and stats cards */}
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-border bg-background/30 space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-primary" />
                      Clustering Metrics
                    </h4>

                    <div className="space-y-2">
                      <div className="flex justify-between text-xs py-1 border-b border-border/30">
                        <span className="text-muted-foreground">Algorithm</span>
                        <span className="font-mono text-white font-medium uppercase">{method}</span>
                      </div>
                      <div className="flex justify-between text-xs py-1 border-b border-border/30">
                        <span className="text-muted-foreground">Clusters Found</span>
                        <span className="font-mono text-white font-medium">{result.n_clusters_found}</span>
                      </div>
                      {method === "dbscan" && (
                        <div className="flex justify-between text-xs py-1 border-b border-border/30">
                          <span className="text-muted-foreground">Noise Points</span>
                          <span className="font-mono text-amber-400 font-medium">{result.noise_count}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-xs py-1 border-b border-border/30">
                        <span className="text-muted-foreground">Silhouette Coefficient</span>
                        <span className="font-mono text-white font-medium">
                          {result.silhouette_score !== null ? result.silhouette_score.toFixed(3) : "—"}
                        </span>
                      </div>
                      {hasMultipleDimensions && (
                        <div className="flex justify-between text-xs py-1">
                          <span className="text-muted-foreground">PCA Variance Explained</span>
                          <span className="font-mono text-white font-medium">
                            {(result.variance_explained * 100).toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {result.silhouette_score !== null && (
                    <div className="p-4 rounded-xl border border-border bg-background/20 text-xs text-muted-foreground leading-relaxed">
                      <HelpCircle className="h-4 w-4 text-primary inline mr-1 -mt-0.5" />
                      The **Silhouette score** measures cluster cohesion and separation. A score near 1 implies clean partitions; a score near 0 or negative signals overlapping clusters.
                    </div>
                  )}

                  {hasMultipleDimensions && (
                    <div className="p-4 rounded-xl border border-yellow-600/20 bg-yellow-600/5 text-xs text-yellow-600/80 leading-relaxed flex gap-2">
                      <Info className="h-4 w-4 shrink-0 mt-0.5 text-yellow-600" />
                      <div>
                        <span>PCA 2D projection explained </span>
                        <strong>{(result.variance_explained * 100).toFixed(1)}%</strong>
                        <span> of high-dimensional variance. Clusters overlapping here might be cleanly separated in full dimensions.</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Plot Area */}
                <div className="lg:col-span-2 p-4 rounded-xl border border-border bg-background/45 flex flex-col justify-between">
                  <div className="mb-2 text-xs font-semibold text-slate-300">
                    2D Visualization {hasMultipleDimensions ? "(PCA Projection)" : `(${selectedCols[0]} vs ${selectedCols[1]})`}
                  </div>

                  <div className="w-full">
                    <ResponsiveContainer width="100%" height={280}>
                      <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                        <XAxis
                          type="number"
                          dataKey="x"
                          name={hasMultipleDimensions ? "PCA 1" : selectedCols[0]}
                          stroke="#64748b"
                          fontSize={10}
                          tickLine={false}
                        />
                        <YAxis
                          type="number"
                          dataKey="y"
                          name={hasMultipleDimensions ? "PCA 2" : selectedCols[1]}
                          stroke="#64748b"
                          fontSize={10}
                          tickLine={false}
                        />
                        <Tooltip
                          cursor={{ strokeDasharray: "3 3" }}
                          contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "8px" }}
                          labelStyle={{ color: "#94a3b8", fontSize: "11px" }}
                          itemStyle={{ color: "#f8fafc", fontSize: "11px" }}
                        />
                        <Scatter name="Data points" data={result.data}>
                          {result.data.map((entry, index) => {
                            const color = getColorForCluster(entry.cluster);
                            return <Cell key={`cell-${index}`} fill={color} />;
                          })}
                        </Scatter>
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="mt-3 text-xs text-slate-300 bg-secondary/25 p-3 rounded-lg border border-border/50 font-medium">
                    {result.insight}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
