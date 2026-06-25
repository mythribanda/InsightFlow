import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, CheckCircle2, Zap, BarChart3, TrendingUp, Lightbulb, Download } from "lucide-react";
import { ClickSpark } from "@/components/reactbits/ClickSpark";
import {
  callModelingAPI,
  checkSuitability,
  getRecommendations,
  getShapAnalysis,
  exportReproductionCode,
  type ModelResponse,
  type LeakageFlag,
  type SuitabilityResponse,
  type RecommendationResponse,
  type ShapResponse,
} from "@/server/modeling";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

interface ModelingPanelProps {
  data: Record<string, unknown>[];
  columns: string[];
  sessionId: string;
}

/**
 * Complete modeling workflow (§4 + addendum):
 * 1. Target selection
 * 2. Target suitability check (S3)
 * 3. Feature recommendations (S2)
 * 4. Model training (§4)
 * 5. Model comparison (S4)
 * 6. SHAP explainability (§4.6)
 *
 * Reuses computation: no duplicate training
 */
type HarmfulFeature = {
  name: string;
  reason: string;
  category: 'constant' | 'leakage' | 'other';
};

export const ModelingPanel: React.FC<ModelingPanelProps> = ({ data, columns, sessionId }) => {
  const [selectedTarget, setSelectedTarget] = useState<string>("");
  const [excludedFeatures, setExcludedFeatures] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<string>("target");
  const [shapSampleIdx, setShapSampleIdx] = useState<number>(0);
  const [harmfulFeatures, setHarmfulFeatures] = useState<HarmfulFeature[]>([]);

  // Server functions
  const runCheckSuitability = useServerFn(checkSuitability);
  const runGetRecommendations = useServerFn(getRecommendations);
  const runCallModelingAPI = useServerFn(callModelingAPI);
  const runGetShapAnalysis = useServerFn(getShapAnalysis);


  const runExportReproductionCode = useServerFn(exportReproductionCode);
  const [isExportingCode, setIsExportingCode] = useState(false);

  const handleDownloadReproductionCode = async () => {
    if (!modelResponse) {
      toast.error("Please train a model first.");
      return;
    }
    setIsExportingCode(true);
    try {
      const codeContent = await runExportReproductionCode({
        data: {
          session_id: sessionId,
          target: selectedTarget,
          excluded_features: Array.from(excludedFeatures),
          leakage: modelResponse.leakage,
          best_model_name: modelResponse.best.model,
          task: modelResponse.task,
        },
      });

      const blob = new Blob([codeContent], { type: "text/x-python;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `reproduce.py`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("Reproduction script downloaded successfully!");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to export reproduction code");
    } finally {
      setIsExportingCode(false);
    }
  };

  // State for each view
  const [suitabilityResult, setSuitabilityResult] = useState<SuitabilityResponse | null>(null);
  const [recommendationsResult, setRecommendationsResult] = useState<RecommendationResponse | null>(null);
  const [modelResponse, setModelResponse] = useState<ModelResponse | null>(null);
  const [shapResponse, setShapResponse] = useState<ShapResponse | null>(null);

  // List the first 20 rows for the select dropdown
  const sampleOptions = useMemo(() => {
    const count = Math.min(data.length, 20);
    const options = [];
    for (let i = 0; i < count; i++) {
      const row = data[i];
      let label = `Row ${i + 1}`;
      for (const key of ["employee_id", "id", "name"]) {
        if (row[key] !== undefined && row[key] !== null) {
          label = `${String(row[key])} (Row ${i + 1})`;
          break;
        }
      }
      options.push({ value: i, label });
    }
    return options;
  }, [data]);

  // Mutations
  const suitabilityMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTarget) throw new Error("Please select a target column");
      const dataDict = Object.fromEntries(
        columns.map((col) => [col, data.map((row) => row[col as keyof typeof row])])
      );
      return runCheckSuitability({ data: { target: selectedTarget, data: dataDict, session_id: sessionId } });
    },
    onSuccess: (result) => {
      setSuitabilityResult(result);
      setActiveTab("recommendations");
      recommendationsMutation.mutate();
    },
  });

  const recommendationsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTarget) throw new Error("Please select a target column");
      const dataDict = Object.fromEntries(
        columns.map((col) => [col, data.map((row) => row[col as keyof typeof row])])
      );
      return runGetRecommendations({ data: { target: selectedTarget, data: dataDict, session_id: sessionId } });
    },
    onSuccess: (result) => {
      setRecommendationsResult(result);
    },
  });

  const modelingMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTarget) throw new Error("Please select a target column");
      const dataDict = Object.fromEntries(
        columns.map((col) => [col, data.map((row) => row[col as keyof typeof row])])
      );
      return runCallModelingAPI({
        data: {
          target: selectedTarget,
          data: dataDict,
          excluded_features: Array.from(excludedFeatures),
          cv_splits: 5,
          session_id: sessionId,
        }
      });
    },
    onSuccess: (response) => {
      setModelResponse(response);
      setActiveTab("comparison");
    },
  });

  const shapMutation = useMutation({
    mutationFn: async (idx: number) => {
      return runGetShapAnalysis({ data: { sample_idx: idx, session_id: sessionId } });
    },
    onSuccess: (response) => {
      setShapResponse(response);
      setActiveTab("shap");
    },
  });


  const handleTargetChange = (value: string) => {
    setSelectedTarget(value);
    setSuitabilityResult(null);
    setRecommendationsResult(null);
    setModelResponse(null);
    setShapResponse(null);
  };

  const toggleExcludeFeature = (col: string) => {
    const newExcluded = new Set(excludedFeatures);
    if (newExcluded.has(col)) {
      newExcluded.delete(col);
    } else {
      newExcluded.add(col);
    }
    setExcludedFeatures(newExcluded);
  };

  const availableFeatures = useMemo(
    () => columns.filter((col) => col !== selectedTarget),
    [columns, selectedTarget]
  );

  useEffect(() => {
    if (!recommendationsResult && !suitabilityResult) {
      setHarmfulFeatures([]);
      return;
    }

    const found: HarmfulFeature[] = [];
    const seen = new Set<string>();

    const addHarmful = (feat: HarmfulFeature) => {
      if (!seen.has(feat.name)) {
        seen.add(feat.name);
        found.push(feat);
      }
    };

    if (recommendationsResult) {
      recommendationsResult.harmful.forEach((item) => {
        const name = availableFeatures.find((f) => item.startsWith(f)) || item.split(" ")[0];
        const rawDetails = item.replace(name, "").trim();
        const details = rawDetails ? rawDetails.replace(/^\(|\)$/g, "") : "Harmful feature";

        if (item.includes("(constant)")) {
          addHarmful({ name, reason: "Constant column", category: "constant" });
        } else if (item.toLowerCase().includes("leakage")) {
          addHarmful({ name, reason: "Leakage detected", category: "leakage" });
        } else {
          let reason = "Flagged as harmful";
          if (details === "high cardinality") reason = "High cardinality";
          if (details === "negative importance") reason = "Negative importance";
          addHarmful({ name, reason, category: "other" });
        }
      });

      recommendationsResult.leakage.forEach((item) => {
        const name = availableFeatures.find((f) => item.startsWith(f)) || item.split(" ")[0];
        const rawDetails = item.replace(name, "").trim();
        const details = rawDetails ? rawDetails.replace(/^\(|\)$/g, "") : "Leakage detected";
        addHarmful({ name, reason: details || "Leakage detected", category: "leakage" });
      });
    }

    if (suitabilityResult) {
      availableFeatures.forEach((feat) => {
        suitabilityResult.warnings.forEach((warn) => {
          if (warn.includes(feat)) {
            const lowerWarn = warn.toLowerCase();
            if (lowerWarn.includes("imbalance") || lowerWarn.includes("imbalanced")) {
              addHarmful({ name: feat, reason: "Imbalance warnings", category: "other" });
            } else if (lowerWarn.includes("constant")) {
              addHarmful({ name: feat, reason: "Constant column", category: "constant" });
            } else if (lowerWarn.includes("leakage")) {
              addHarmful({ name: feat, reason: "Leakage detected", category: "leakage" });
            }
          }
        });
        suitabilityResult.issues.forEach((issue) => {
          if (issue.includes(feat)) {
            const lowerIssue = issue.toLowerCase();
            if (lowerIssue.includes("imbalance") || lowerIssue.includes("imbalanced")) {
              addHarmful({ name: feat, reason: "Imbalance warnings", category: "other" });
            } else if (lowerIssue.includes("constant")) {
              addHarmful({ name: feat, reason: "Constant column", category: "constant" });
            } else if (lowerIssue.includes("leakage")) {
              addHarmful({ name: feat, reason: "Leakage detected", category: "leakage" });
            }
          }
        });
      });
    }

    setHarmfulFeatures(found);
  }, [recommendationsResult, suitabilityResult, availableFeatures]);

  useEffect(() => {
    setExcludedFeatures(new Set(harmfulFeatures.map((f) => f.name)));
  }, [harmfulFeatures]);

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="target">Target</TabsTrigger>
          <TabsTrigger value="recommendations" disabled={!suitabilityResult}>Features (S2)</TabsTrigger>
          <TabsTrigger value="train" disabled={!recommendationsResult}>Train (§4)</TabsTrigger>
          <TabsTrigger value="comparison" disabled={!modelResponse}>Compare (S4)</TabsTrigger>
          <TabsTrigger value="shap" disabled={!modelResponse}>SHAP (§4.6)</TabsTrigger>
        </TabsList>

        {/* Tab 1: Target Selection */}
        <TabsContent value="target">
          <Card>
            <CardHeader>
              <CardTitle>Select Target Variable</CardTitle>
              <CardDescription>Choose what to predict</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Target Column</label>
                <Select value={selectedTarget} onValueChange={handleTargetChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select target column..." />
                  </SelectTrigger>
                  <SelectContent>
                    {columns.map((col) => (
                      <SelectItem key={col} value={col}>
                        {col}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => {
                  setSuitabilityResult(null);
                  setRecommendationsResult(null);
                  setModelResponse(null);
                  suitabilityMutation.mutate();
                }}
                disabled={!selectedTarget || suitabilityMutation.isPending}
                className="w-full"
              >
                {suitabilityMutation.isPending ? "Checking..." : "Next: Feature Analysis →"}
              </Button>
              {suitabilityMutation.isError && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>
                    {suitabilityMutation.error instanceof Error
                      ? suitabilityMutation.error.message
                      : "Failed to check suitability"}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Feature Recommendations (S2) */}
        <TabsContent value="recommendations">
          {suitabilityResult && (
            <Card>
              <CardHeader>
                <CardTitle>Feature Recommendations (S2)</CardTitle>
                <CardDescription>
                  Data Health: {suitabilityResult.n_samples} samples × {suitabilityResult.n_features} features
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Issues */}
                {suitabilityResult.issues.length > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Issues</AlertTitle>
                    <AlertDescription>
                      <ul className="list-disc list-inside space-y-1 mt-2">
                        {suitabilityResult.issues.map((issue, i) => (
                          <li key={i} className="text-sm">
                            {issue}
                          </li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Warnings */}
                {suitabilityResult.warnings.length > 0 && (
                  <Alert>
                    <Zap className="h-4 w-4" />
                    <AlertTitle>Warnings (Heuristic)</AlertTitle>
                    <AlertDescription>
                      <ul className="list-disc list-inside space-y-1 mt-2">
                        {suitabilityResult.warnings.map((warning, i) => (
                          <li key={i} className="text-sm">
                            {warning}
                          </li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Feature Buckets */}
                {recommendationsMutation.isPending && (
                  <div className="flex flex-col items-center justify-center p-6 space-y-3 border rounded-lg border-border bg-card/20 animate-pulse my-4">
                    <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <p className="text-xs text-muted-foreground">Running pre-training feature recommendations...</p>
                  </div>
                )}

                {recommendationsResult && (
                  <div className="space-y-4 my-4">
                    {recommendationsResult.high_signal.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2">✓ High Signal ({recommendationsResult.high_signal.length})</h4>
                        <div className="flex flex-wrap gap-2">
                          {recommendationsResult.high_signal.map((col) => (
                            <Badge key={col} variant="default" className="bg-green-600">
                              {col}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {recommendationsResult.low_signal.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2">△ Low Signal ({recommendationsResult.low_signal.length})</h4>
                        <div className="flex flex-wrap gap-2">
                          {recommendationsResult.low_signal.map((col) => (
                            <Badge key={col} variant="secondary">
                              {col}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {recommendationsResult.harmful.length > 0 && (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Harmful Features ({recommendationsResult.harmful.length})</AlertTitle>
                        <AlertDescription>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {recommendationsResult.harmful.map((col) => (
                              <Badge key={col} variant="destructive">
                                {col}
                              </Badge>
                            ))}
                          </div>
                          <p className="text-sm mt-2">These have negative importance—consider excluding.</p>
                        </AlertDescription>
                      </Alert>
                    )}

                    {recommendationsResult.leakage.length > 0 && (
                      <Alert variant="destructive">
                        <Zap className="h-4 w-4" />
                        <AlertTitle>Leakage Risk ({recommendationsResult.leakage.length})</AlertTitle>
                        <AlertDescription>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {recommendationsResult.leakage.map((col) => (
                              <Badge key={col} variant="destructive">
                                {col}
                              </Badge>
                            ))}
                          </div>
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      setActiveTab("target");
                    }}
                    variant="outline"
                  >
                    ← Back
                  </Button>
                  <Button
                    onClick={() => {
                      setActiveTab("train");
                    }}
                    disabled={recommendationsMutation.isPending || !recommendationsResult}
                    className="flex-1"
                  >
                    Next: Configure & Train →
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab 3: Train & Configure (§4) */}
        <TabsContent value="train">
          <Card>
            <CardHeader>
              <CardTitle>Configure & Train (§4)</CardTitle>
              <CardDescription>Exclude features and train both models</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {availableFeatures.length > 0 && (() => {
                const harmfulList = availableFeatures.filter((col) => harmfulFeatures.some((f) => f.name === col));
                const cleanList = availableFeatures.filter((col) => !harmfulFeatures.some((f) => f.name === col));
                return (
                  <div className="space-y-4">
                    {/* 🔴 Auto-excluded harmful features */}
                    {harmfulList.length > 0 && (
                      <div className="rounded-lg border border-red-500/20 bg-red-950/5 p-4 space-y-2">
                        <label className="block text-xs font-semibold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
                          <span className="text-sm">🔴</span> Auto-excluded (Flagged as Harmful)
                        </label>
                        <p className="text-[11px] text-muted-foreground">
                          These features were flagged as harmful (constant value, leakage detected, or severe imbalance) and are auto-excluded. Click any to override and include it anyway.
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1">
                          {harmfulList.map((col) => {
                            const harmful = harmfulFeatures.find((f) => f.name === col)!;
                            const isExcluded = excludedFeatures.has(col);
                            return (
                              <Badge
                                key={col}
                                variant={isExcluded ? "destructive" : "outline"}
                                className={`cursor-pointer flex items-center gap-1.5 py-1 px-2.5 transition-all ${
                                  isExcluded 
                                    ? "bg-red-500/10 border-red-500/40 text-red-400 hover:bg-red-500/20 line-through decoration-red-500/60" 
                                    : "border-border bg-transparent text-muted-foreground hover:bg-secondary/40"
                                }`}
                                onClick={() => toggleExcludeFeature(col)}
                              >
                                <AlertTriangle className={`h-3 w-3 ${isExcluded ? "text-red-400" : "text-muted-foreground"}`} />
                                <span>
                                  {col} <span className="text-[10px] opacity-80 font-normal">({harmful.reason})</span>
                                </span>
                                {isExcluded && <span className="ml-1 text-[10px]">✕</span>}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Exclude Features (Optional) */}
                    {cleanList.length > 0 && (
                      <div className="space-y-2">
                        <label className="block text-sm font-medium">Exclude Features (Optional)</label>
                        <div className="flex flex-wrap gap-2">
                          {cleanList.map((col) => {
                            const isExcluded = excludedFeatures.has(col);
                            return (
                              <Badge
                                key={col}
                                variant={isExcluded ? "destructive" : "outline"}
                                className="cursor-pointer py-1 px-2.5"
                                onClick={() => toggleExcludeFeature(col)}
                              >
                                <span>{col}</span>
                                {isExcluded && <span className="ml-1 text-[10px]">✕</span>}
                              </Badge>
                            );
                          })}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Click to exclude clean features from the model training process if needed.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="flex flex-col sm:flex-row gap-3">
                <ClickSpark sparkCount={10} sparkColor="var(--color-primary)" sparkRadius={56} className="flex-1">
                  <Button
                    onClick={() => modelingMutation.mutate()}
                    disabled={modelingMutation.isPending}
                    className="w-full"
                  >
                    {modelingMutation.isPending ? "Training..." : "Train Both Models"}
                  </Button>
                </ClickSpark>

                {modelResponse && (
                  <Button
                    type="button"
                    onClick={handleDownloadReproductionCode}
                    disabled={isExportingCode}
                    variant="outline"
                    className="flex-1 border-emerald-500/40 hover:border-emerald-500 text-emerald-500 hover:bg-emerald-500/5 transition-all flex items-center justify-center gap-2"
                  >
                    {isExportingCode ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500/80 border-t-transparent" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    {isExportingCode ? "Generating..." : "Reproduction Code"}
                  </Button>
                )}
              </div>

              {modelingMutation.isError && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>
                    {modelingMutation.error instanceof Error
                      ? modelingMutation.error.message
                      : "Failed to train models"}
                  </AlertDescription>
                </Alert>
              )}

              <Button
                onClick={() => setActiveTab("recommendations")}
                variant="outline"
                className="w-full"
              >
                ← Back
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Model Comparison (S4) */}
        <TabsContent value="comparison">
          {modelResponse && (
            <Card>
              <CardHeader>
                <CardTitle>Model Comparison (S4)</CardTitle>
                <CardDescription>
                  Task: <Badge>{modelResponse.task}</Badge> | Best:{" "}
                  <Badge variant="secondary">{modelResponse.best.model}</Badge>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {modelResponse.leakage.length > 0 && (
                  <Alert className="border-yellow-200 bg-yellow-50">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <AlertTitle>Leakage Warnings</AlertTitle>
                    <AlertDescription>
                      <div className="space-y-2 mt-2">
                        {modelResponse.leakage.map((flag) => (
                          <div key={flag.column} className="text-sm">
                            <strong>{flag.column}</strong>: {flag.reason}
                          </div>
                        ))}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 bg-muted rounded">
                    <p className="text-xs text-muted-foreground">Metric</p>
                    <p className="text-sm font-bold">{modelResponse.best.primary_metric.toUpperCase()}</p>
                  </div>
                  <div className="p-3 bg-primary/10 rounded border border-primary">
                    <p className="text-xs text-muted-foreground">Best Value</p>
                    <p className="text-lg font-bold text-primary">
                      {modelResponse.best.value.toFixed(3)}
                    </p>
                    <p className="text-xs text-muted-foreground">±{modelResponse.best.std.toFixed(3)}</p>
                  </div>
                  <div className="p-3 bg-muted rounded">
                    <p className="text-xs text-muted-foreground">Model</p>
                    <p className="text-sm font-bold">{modelResponse.best.model}</p>
                  </div>
                </div>

                <MetricsTable results={modelResponse.results} task={modelResponse.task} best={modelResponse.best} />

                <ClassImbalanceWarning data={data} targetCol={selectedTarget} />

                <div className="flex items-end gap-3 p-4 rounded-lg border border-border/80 bg-muted/20 my-2">
                  <div className="flex flex-col space-y-1.5 flex-1 text-left">
                    <label className="text-xs font-semibold text-muted-foreground">Select Row for SHAP explanation</label>
                    <Select
                      value={String(shapSampleIdx)}
                      onValueChange={(val) => setShapSampleIdx(Number(val))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select row..." />
                      </SelectTrigger>
                      <SelectContent>
                        {sampleOptions.map((opt) => (
                          <SelectItem key={opt.value} value={String(opt.value)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col space-y-1.5 w-24 text-left">
                    <label className="text-xs font-semibold text-muted-foreground">Or Index</label>
                    <Input
                      type="number"
                      min={0}
                      max={data.length - 1}
                      value={shapSampleIdx}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(data.length - 1, Number(e.target.value) || 0));
                        setShapSampleIdx(val);
                      }}
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <Button onClick={() => setActiveTab("train")} variant="outline" className="flex-1">
                    ← Retrain
                  </Button>
                  <Button
                    type="button"
                    onClick={handleDownloadReproductionCode}
                    disabled={isExportingCode}
                    variant="outline"
                    className="flex-1 border-emerald-500/40 hover:border-emerald-500 text-emerald-500 hover:bg-emerald-500/5 transition-all flex items-center justify-center gap-2"
                  >
                    {isExportingCode ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500/80 border-t-transparent" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    {isExportingCode ? "Generating..." : "Reproduction Code"}
                  </Button>
                  <Button
                    onClick={() => {
                      shapMutation.mutate(shapSampleIdx);
                    }}
                    disabled={shapMutation.isPending}
                    className="flex-[2]"
                  >
                    {shapMutation.isPending ? "Generating..." : "SHAP Analysis →"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab 5: SHAP Analysis (§4.6) */}
        <TabsContent value="shap">
          {shapResponse && (
            <Card>
              <CardHeader>
                <CardTitle>SHAP Explainability (§4.6)</CardTitle>
                <CardDescription>Model interpretability—why did it predict that?</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {shapResponse.error && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>SHAP Error</AlertTitle>
                    <AlertDescription>{shapResponse.error}</AlertDescription>
                  </Alert>
                )}

                {/* Inline Row Selector to easily change explained sample */}
                <div className="flex items-end gap-3 p-4 rounded-lg border border-border/80 bg-muted/20">
                  <div className="flex flex-col space-y-1.5 flex-1 text-left">
                    <label className="text-xs font-semibold text-muted-foreground">Select Row to Explain</label>
                    <Select
                      value={String(shapSampleIdx)}
                      onValueChange={(val) => setShapSampleIdx(Number(val))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select row..." />
                      </SelectTrigger>
                      <SelectContent>
                        {sampleOptions.map((opt) => (
                          <SelectItem key={opt.value} value={String(opt.value)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col space-y-1.5 w-24 text-left">
                    <label className="text-xs font-semibold text-muted-foreground">Or Index</label>
                    <Input
                      type="number"
                      min={0}
                      max={data.length - 1}
                      value={shapSampleIdx}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(data.length - 1, Number(e.target.value) || 0));
                        setShapSampleIdx(val);
                      }}
                    />
                  </div>
                  <Button
                    onClick={() => shapMutation.mutate(shapSampleIdx)}
                    disabled={shapMutation.isPending}
                  >
                    {shapMutation.isPending ? "Explaining..." : "Explain Row"}
                  </Button>
                </div>

                {shapResponse.global_importance && (
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" /> Global Feature Importance
                    </h4>
                    <img
                      src={`data:image/png;base64,${shapResponse.global_importance}`}
                      alt="Global importance"
                      className="w-full border rounded"
                    />
                  </div>
                )}

                {shapResponse.per_sample_waterfall && (
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" /> Per-Sample Waterfall for {shapResponse.row_label || `Row ${shapSampleIdx + 1}`} (Index #{shapSampleIdx})
                    </h4>
                    {shapResponse.prediction !== undefined && shapResponse.prediction !== null && (
                      <div className="p-3 bg-primary/5 rounded border border-primary/20 text-sm font-semibold flex justify-between items-center my-2">
                        <span className="text-muted-foreground">Model Prediction:</span>
                        <span className="font-mono text-primary font-bold text-base">
                          {shapResponse.prediction.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                        </span>
                      </div>
                    )}
                    <img
                      src={`data:image/png;base64,${shapResponse.per_sample_waterfall}`}
                      alt="Per-sample waterfall"
                      className="w-full border rounded"
                    />
                  </div>
                )}

                <Button onClick={() => setActiveTab("comparison")} variant="outline" className="w-full">
                  ← Back to Comparison
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};


// ============ HELPER COMPONENTS ============

interface MetricsTableProps {
  results: Array<{
    model: string;
    metrics: Record<string, number>;
    std: Record<string, number>;
  }>;
  task: string;
  best: { model: string; primary_metric: string; value: number };
}

const MetricsTable: React.FC<MetricsTableProps> = ({ results, task, best }) => {
  const metricNames =
    task === "classification"
      ? ["accuracy", "precision", "recall", "f1", "roc_auc", "balanced_accuracy"]
      : ["mae", "rmse", "r2", "mape"];

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="font-semibold">Model</TableHead>
            {metricNames.map((metric) => (
              <TableHead key={metric} className="text-right">
                {metric.toUpperCase()}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((result) => (
            <TableRow key={result.model} className={result.model === best.model ? "bg-primary/10 border-l-2 border-primary" : ""}>
              <TableCell className="font-medium">
                {result.model}
                {result.model === best.model && <Badge className="ml-2">BEST</Badge>}
              </TableCell>
              {metricNames.map((metric) => {
                const mean = result.metrics[metric];
                const std = result.std[metric];
                const isNaN = mean === null || mean === undefined || Number.isNaN(mean);
                const isBestMetric = result.model === best.model && metric === best.primary_metric;

                return (
                  <TableCell
                    key={metric}
                    className={`text-right text-sm font-${isBestMetric ? "bold" : "normal"}`}
                  >
                    {isNaN ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <>
                        <span className={isBestMetric ? "text-primary font-bold" : ""}>
                          {mean.toFixed(3)}
                        </span>
                        <span className="text-muted-foreground"> ±{std.toFixed(3)}</span>
                      </>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

interface ClassImbalanceWarningProps {
  data: Record<string, unknown>[];
  targetCol: string;
}

const ClassImbalanceWarning: React.FC<ClassImbalanceWarningProps> = ({ data, targetCol }) => {
  const valueCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    data.forEach((row) => {
      const val = String(row[targetCol]);
      counts[val] = (counts[val] || 0) + 1;
    });
    return counts;
  }, [data, targetCol]);

  const maxCount = Math.max(...Object.values(valueCounts));
  const majorityShare = maxCount / data.length;

  if (majorityShare > 0.8) {
    return (
      <Alert variant="destructive" className="border-red-300 bg-red-50">
        <Zap className="h-4 w-4" />
        <AlertTitle>Class Imbalance Detected</AlertTitle>
        <AlertDescription>
          Majority class represents {(majorityShare * 100).toFixed(1)}% of the data. Accuracy is
          misleading—focus on <strong>F1 Score</strong> or <strong>Balanced Accuracy</strong> instead.
        </AlertDescription>
      </Alert>
    );
  }

  return null;
};

export default ModelingPanel;

