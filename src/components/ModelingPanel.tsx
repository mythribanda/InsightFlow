import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { AlertTriangle, CheckCircle2, Zap, BarChart3, TrendingUp, Lightbulb, Download, ArrowUpDown, ArrowUp, ArrowDown, Clock, Trophy, Settings2, ChevronDown, ChevronUp, Sparkles, Trash2 } from "lucide-react";
import { ClickSpark } from "@/components/reactbits/ClickSpark";
import {
  callModelingAPI,
  checkSuitability,
  getRecommendations,
  getShapAnalysis,
  exportReproductionCode,
  runHyperparameterTuning,
  type ModelResponse,
  type LeakageFlag,
  type SuitabilityResponse,
  type RecommendationResponse,
  type ShapResponse,
  type TuneResponse,
} from "@/server/modeling";
import { getExperimentRuns, deleteExperimentRun, type ExperimentRun } from "@/server/experiments";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Skeleton, SkeletonFeatureBuckets, SkeletonCardHeader, SkeletonTable } from "@/components/ui/Skeleton";
import { cardVariants, containerVariants, listItemVariants, panelVariants } from "@/hooks/useAnimationVariants";
import { fireModelTrainingConfetti } from "@/lib/confetti";

interface ModelingPanelProps {
  data: Record<string, unknown>[];
  columns: string[];
  sessionId: string;
  projectId?: string;
  initialExcludedFeatures?: string[];
  onClearExcluded?: () => void;
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

export const ModelingPanel: React.FC<ModelingPanelProps> = ({
  data,
  columns,
  sessionId,
  projectId,
  initialExcludedFeatures,
  onClearExcluded,
}) => {
  const [selectedTarget, setSelectedTarget] = useState<string>("");
  const [excludedFeatures, setExcludedFeatures] = useState<Set<string>>(
    new Set(initialExcludedFeatures || [])
  );

  React.useEffect(() => {
    if (initialExcludedFeatures && initialExcludedFeatures.length > 0) {
      setExcludedFeatures(new Set(initialExcludedFeatures));
      onClearExcluded?.();
    }
  }, [initialExcludedFeatures, onClearExcluded]);
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
          project_id: projectId,
        }
      });
    },
    onSuccess: (response) => {
      setModelResponse(response);
      setActiveTab("comparison");
      // One-shot confetti burst on first successful model training
      fireModelTrainingConfetti();
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
        suitabilityResult?.warnings?.forEach((warn) => {
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
        suitabilityResult?.issues?.forEach((issue) => {
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
          <TabsTrigger value="history">History</TabsTrigger>
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
                {suitabilityResult?.issues && suitabilityResult.issues.length > 0 && (
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
                {suitabilityResult?.warnings && suitabilityResult.warnings.length > 0 && (
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
                  <SkeletonFeatureBuckets />
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

                <LeaderboardTable results={modelResponse.results} task={modelResponse.task} best={modelResponse.best} sessionId={sessionId} />

                {modelResponse.baseline_coefficients && (
                  <div className="space-y-3 pt-4 border-t border-border/80">
                    <div className="flex items-center justify-between">
                      <div className="text-left">
                        <h4 className="text-sm font-semibold flex items-center gap-1.5">
                          <Settings2 className="h-4 w-4 text-violet-400" />
                          Baseline Regression Summary
                        </h4>
                        <p className="text-[11px] text-muted-foreground">
                          Feature weights from the baseline {modelResponse.task === "classification" ? "Logistic" : "Linear"} Regression model.
                        </p>
                      </div>
                      <Badge variant="secondary" className="font-mono text-xs">
                        Intercept: {modelResponse.baseline_coefficients.intercept.toFixed(4)}
                      </Badge>
                    </div>

                    <div className="rounded-lg border border-border overflow-hidden max-h-[300px] overflow-y-auto custom-scrollbar">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40">
                            <TableHead className="w-[180px]">Feature</TableHead>
                            <TableHead className="w-[80px] text-right">Weight</TableHead>
                            <TableHead className="text-center">Coefficient Direction & Magnitude</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {modelResponse.baseline_coefficients.coefficients.map((c) => {
                            const maxAbs = Math.max(
                              ...modelResponse.baseline_coefficients!.coefficients.map((x) => Math.abs(x.coefficient)),
                              0.0001
                            );
                            const percent = (Math.abs(c.coefficient) / maxAbs) * 100;
                            const isPositive = c.coefficient >= 0;

                            return (
                              <TableRow key={c.feature} className="hover:bg-muted/20">
                                <TableCell className="font-medium text-xs truncate max-w-[180px] text-left" title={c.feature}>
                                  {c.feature}
                                </TableCell>
                                <TableCell className="text-right font-mono text-xs tabular-nums font-semibold">
                                  {isPositive ? "+" : ""}{c.coefficient.toFixed(4)}
                                </TableCell>
                                <TableCell className="py-2.5">
                                  <div className="flex items-center w-full h-5 bg-muted/20 rounded overflow-hidden border border-border/50 relative">
                                    <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-border/80 z-10" />
                                    <div className="w-1/2 flex justify-end pr-0.5 h-full">
                                      {!isPositive && (
                                        <div
                                          className="bg-red-500/80 hover:bg-red-500 h-3 my-auto rounded-sm transition-all duration-300"
                                          style={{ width: `${percent}%` }}
                                          title={`Negative impact: ${c.coefficient.toFixed(4)}`}
                                        />
                                      )}
                                    </div>
                                    <div className="w-1/2 flex justify-start pl-0.5 h-full">
                                      {isPositive && (
                                        <div
                                          className="bg-emerald-500/80 hover:bg-emerald-500 h-3 my-auto rounded-sm transition-all duration-300"
                                          style={{ width: `${percent}%` }}
                                          title={`Positive impact: ${c.coefficient.toFixed(4)}`}
                                        />
                                      )}
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

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

        {/* Tab 6: Experiment History */}
        <TabsContent value="history">
          <ExperimentHistoryTab projectId={projectId} task={modelResponse?.task || suitabilityResult?.task || "classification"} />
        </TabsContent>
      </Tabs>
    </div>
  );
};


interface ExperimentHistoryTabProps {
  projectId?: string;
  task: string;
}

const ExperimentHistoryTab: React.FC<ExperimentHistoryTabProps> = ({ projectId, task }) => {
  const [selectedRuns, setSelectedRuns] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<string>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const deleteRunMutation = useMutation({
    mutationFn: async (runId: string) => {
      if (!projectId) return;
      await deleteExperimentRun({ data: { project_id: projectId, run_id: runId } });
    },
    onSuccess: () => {
      toast.success("Experiment run deleted");
      refetch();
    },
    onError: (err: any) => {
      toast.error(err instanceof Error ? err.message : "Failed to delete run");
    }
  });

  const { data: runs = [], isLoading, error, refetch } = useQuery<ExperimentRun[]>({
    queryKey: ["experiment_runs", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await getExperimentRuns({ data: { project_id: projectId } });
      return res;
    },
    enabled: !!projectId,
  });

  // Toggle selection
  const toggleSelect = (runId: string) => {
    setSelectedRuns((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
  };

  const metricNames =
    task === "classification"
      ? ["accuracy", "f1", "roc_auc", "balanced_accuracy", "precision", "recall"]
      : ["r2", "rmse", "mae", "mape"];

  const lowerIsBetter = new Set(["rmse", "mae", "mape"]);

  // Sort logic
  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(lowerIsBetter.has(key) ? "asc" : "desc");
    }
  };

  const sortedRuns = useMemo(() => {
    return [...runs].sort((a: ExperimentRun, b: ExperimentRun) => {
      let av: any;
      let bv: any;
      if (sortKey === "created_at") {
        av = new Date(a.created_at).getTime();
        bv = new Date(b.created_at).getTime();
      } else if (sortKey === "model_name") {
        av = a.model_name.toLowerCase();
        bv = b.model_name.toLowerCase();
      } else {
        av = a.metrics[sortKey] ?? (sortDir === "desc" ? -Infinity : Infinity);
        bv = b.metrics[sortKey] ?? (sortDir === "desc" ? -Infinity : Infinity);
      }
      if (av === bv) return 0;
      const factor = sortDir === "desc" ? -1 : 1;
      return av > bv ? factor : -factor;
    });
  }, [runs, sortKey, sortDir]);

  if (!projectId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Experiment History</CardTitle>
          <CardDescription>Track and compare past training runs</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center space-y-3">
          <Settings2 className="h-10 w-10 text-muted-foreground opacity-60" />
          <p className="text-sm text-muted-foreground max-w-sm">
            This session is not saved to a project yet. Please save your project from the top toolbar to track and persist experiment history.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-4 w-48" />
        <SkeletonTable rows={4} cols={5} />
      </div>
    );
  }


  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Failed to load history</AlertTitle>
        <AlertDescription>{error instanceof Error ? error.message : "Unknown error"}</AlertDescription>
      </Alert>
    );
  }

  const selectedList = runs.filter((r: ExperimentRun) => selectedRuns.has(r.id));

  // Determine best performers among selected runs per metric
  const bestScores = selectedList.reduce((acc: Record<string, number>, run: ExperimentRun) => {
    for (const metric of metricNames) {
      const val = run.metrics[metric];
      if (val === undefined || val === null) continue;
      const isLower = lowerIsBetter.has(metric);
      const currBest = acc[metric];
      if (
        currBest === undefined ||
        (isLower ? val < currBest : val > currBest)
      ) {
        acc[metric] = val;
      }
    }
    return acc;
  }, {} as Record<string, number>);

  const SortIcon = ({ col }: { col: string }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40 inline" />;
    return sortDir === "desc"
      ? <ArrowDown className="h-3 w-3 ml-1 text-primary inline" />
      : <ArrowUp className="h-3 w-3 ml-1 text-primary inline" />;
  };

  const SortableHead = ({ col, label, className }: { col: string; label: string; className?: string }) => (
    <TableHead
      className={`cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap ${className ?? ""}`}
      onClick={() => handleSort(col)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        <SortIcon col={col} />
      </span>
    </TableHead>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Experiment History</CardTitle>
              <CardDescription>All trained runs for this project. Check 2+ runs to compare.</CardDescription>
            </div>
            <Badge variant="secondary" className="font-mono text-xs">
              {runs.length} Runs
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
              <Zap className="h-8 w-8 text-muted-foreground opacity-50" />
              <p className="text-sm font-semibold text-muted-foreground">No runs recorded yet</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Once you click "Train Models" in the Train tab, each model's results will be persisted here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-[40px] text-center"></TableHead>
                    <SortableHead col="created_at" label="Date" className="min-w-[140px]" />
                    <SortableHead col="model_name" label="Model" className="min-w-[180px]" />
                    {metricNames.map((m) => (
                      <SortableHead key={m} col={m} label={m.toUpperCase()} className="text-right" />
                    ))}
                    <TableHead className="w-[60px] text-right">Delete</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRuns.map((run: ExperimentRun) => {
                    const dateObj = new Date(run.created_at);
                    const formattedDate = dateObj.toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    const relativeTime = getRelativeTime(dateObj);

                    return (
                      <TableRow
                        key={run.id}
                        className={`transition-colors ${
                          selectedRuns.has(run.id) ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/30"
                        }`}
                      >
                        <TableCell className="text-center">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary accent-primary"
                            checked={selectedRuns.has(run.id)}
                            onChange={() => toggleSelect(run.id)}
                          />
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          <span title={dateObj.toISOString()}>{relativeTime}</span>
                          <span className="block text-[10px] opacity-75">{formattedDate}</span>
                        </TableCell>
                        <TableCell className="font-medium text-sm">
                          {run.model_name}
                        </TableCell>
                        {metricNames.map((metric) => {
                          const val = run.metrics[metric];
                          return (
                            <TableCell key={metric} className="text-right text-sm font-mono tabular-nums">
                              {val !== undefined && val !== null ? val.toFixed(4) : "\u2014"}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-right">
                          <button
                            disabled={deleteRunMutation.isPending}
                            onClick={() => {
                              if (confirm("Are you sure you want to delete this experiment run?")) {
                                deleteRunMutation.mutate(run.id);
                              }
                            }}
                            className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors inline-flex items-center"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Comparison Panel */}
      {selectedList.length >= 2 && (
        <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/5 via-transparent to-transparent animate-in slide-in-from-bottom-2 duration-300">
          <CardHeader className="pb-3 border-b border-border/60">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-500" />
                  Side-by-Side Comparison
                </CardTitle>
                <CardDescription>
                  Comparing {selectedList.length} runs. Winning metrics highlighted in gold.
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-8 text-muted-foreground hover:text-foreground"
                onClick={() => setSelectedRuns(new Set())}
              >
                Clear comparison
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="font-semibold min-w-[150px]">Run info</TableHead>
                    {metricNames.map((m) => (
                      <TableHead key={m} className="text-right font-semibold">{m.toUpperCase()}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedList.map((run: ExperimentRun) => {
                    const relativeTime = getRelativeTime(new Date(run.created_at));
                    return (
                      <TableRow key={run.id} className="hover:bg-muted/10">
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-semibold text-sm">{run.model_name}</span>
                            <span className="text-[10px] text-muted-foreground font-mono">{relativeTime}</span>
                          </div>
                        </TableCell>
                        {metricNames.map((metric) => {
                          const val = run.metrics[metric];
                          const isBest = val !== undefined && val !== null && bestScores[metric] === val;
                          return (
                            <TableCell
                              key={metric}
                              className={`text-right text-sm font-mono tabular-nums ${
                                isBest ? "font-bold text-amber-600 dark:text-amber-400 bg-amber-500/5" : ""
                              }`}
                            >
                              <div className="flex items-center justify-end gap-1.5">
                                {isBest && <Trophy className="h-3 w-3 text-amber-500 shrink-0" />}
                                <span>{val !== undefined && val !== null ? val.toFixed(4) : "\u2014"}</span>
                              </div>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

function getRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 30) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin === 1) return "1m ago";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour === 1) return "1h ago";
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay === 1) return "yesterday";
  return `${diffDay}d ago`;
}


// ============ HELPER COMPONENTS ============

interface LeaderboardTableProps {
  results: Array<{
    model: string;
    metrics: Record<string, number>;
    std: Record<string, number>;
    training_time_seconds?: number;
    inference_time_ms?: number;
  }>;
  task: string;
  best: { model: string; primary_metric: string; value: number };
  sessionId: string;
}

type SortDir = "asc" | "desc";

/** Format seconds to a human-readable string (e.g. 1.23 s, 342 ms). */
function fmtTrainTime(seconds?: number): string {
  if (seconds === undefined || seconds === null) return "\u2014";
  if (seconds >= 1) return `${seconds.toFixed(2)} s`;
  return `${(seconds * 1000).toFixed(0)} ms`;
}

/** Format per-sample inference latency in ms. */
function fmtInferMs(ms?: number): string {
  if (ms === undefined || ms === null) return "\u2014";
  if (ms < 0.01) return `<0.01 ms`;
  return `${ms.toFixed(3)} ms`;
}

/** Format score improvement delta with sign and color class. */
function scoreDelta(tuned: number, baseline?: number): { text: string; improved: boolean } | null {
  if (baseline === undefined || baseline === null) return null;
  const delta = tuned - baseline;
  return {
    text: `${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(2)}pp`,
    improved: delta > 0,
  };
}

// ── Tune panel (per-row, self-contained) ─────────────────────────────────────
interface TunePanelProps {
  modelName: string;
  sessionId: string;
  task: string;
  onClose: () => void;
}

const TunePanel: React.FC<TunePanelProps> = ({ modelName, sessionId, task, onClose }) => {
  const runTune = useServerFn(runHyperparameterTuning);
  const [searchType, setSearchType] = useState<"grid" | "random">("random");
  const [nIter, setNIter] = useState(20);
  const [customGridRaw, setCustomGridRaw] = useState("");
  const [showCustomGrid, setShowCustomGrid] = useState(false);
  const [tuneResult, setTuneResult] = useState<TuneResponse | null>(null);
  const [tuneError, setTuneError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleRun = async () => {
    setTuneError(null);
    setTuneResult(null);
    setIsPending(true);
    try {
      let paramGrid: Record<string, unknown[]> | undefined;
      if (showCustomGrid && customGridRaw.trim()) {
        try {
          paramGrid = JSON.parse(customGridRaw);
        } catch {
          setTuneError("Invalid JSON in custom param grid.");
          setIsPending(false);
          return;
        }
      }
      const result = await runTune({
        data: {
          session_id: sessionId,
          model_name: modelName,
          search_type: searchType,
          n_iter: nIter,
          param_grid: paramGrid ?? undefined,
        },
      });
      setTuneResult(result);
      toast.success(`Tuning complete! ${result.scoring_metric.toUpperCase()}: ${result.best_score.toFixed(4)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Tuning failed";
      setTuneError(msg);
      toast.error(msg);
    } finally {
      setIsPending(false);
    }
  };

  const delta = tuneResult ? scoreDelta(tuneResult.best_score, tuneResult.baseline_score) : null;

  return (
    <div className="px-4 py-3 bg-gradient-to-br from-violet-950/40 via-indigo-950/30 to-background border-t border-violet-500/20 space-y-3 animate-in slide-in-from-top-2 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-semibold text-violet-300">Tune: {modelName}</span>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors text-xs"
        >
          ✕ Close
        </button>
      </div>

      {/* Controls */}
      {!tuneResult && (
        <div className="space-y-3">
          {/* Search type */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-24 shrink-0">Search type</span>
            <div className="flex gap-1.5">
              {(["random", "grid"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setSearchType(t)}
                  className={`px-3 py-1 text-xs rounded-md border transition-all ${
                    searchType === t
                      ? "bg-violet-600 border-violet-500 text-white font-semibold"
                      : "border-border text-muted-foreground hover:border-violet-500/50 hover:text-foreground"
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* n_iter (random only) */}
          {searchType === "random" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-24 shrink-0">Iterations</span>
              <div className="flex items-center gap-3 flex-1">
                <input
                  type="range"
                  min={5}
                  max={50}
                  step={5}
                  value={nIter}
                  onChange={(e) => setNIter(Number(e.target.value))}
                  className="flex-1 accent-violet-500"
                />
                <span className="text-xs font-mono text-violet-300 w-6 text-right">{nIter}</span>
              </div>
            </div>
          )}

          {/* Custom param grid toggle */}
          <div>
            <button
              onClick={() => setShowCustomGrid((v) => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showCustomGrid ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              Custom param grid (JSON, optional)
            </button>
            {showCustomGrid && (
              <textarea
                rows={5}
                value={customGridRaw}
                onChange={(e) => setCustomGridRaw(e.target.value)}
                placeholder={`{\n  "model__max_iter": [50, 100, 200],\n  "model__learning_rate": [0.05, 0.1, 0.2]\n}`}
                className="mt-2 w-full text-xs font-mono bg-background border border-border rounded-md p-2 resize-none focus:ring-1 focus:ring-violet-500 focus:outline-none text-foreground placeholder:text-muted-foreground/50"
              />
            )}
          </div>

          {/* Run button */}
          <Button
            onClick={handleRun}
            disabled={isPending}
            className="w-full bg-violet-600 hover:bg-violet-500 text-white font-semibold transition-all"
            size="sm"
          >
            {isPending ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                Tuning\u2026 ({searchType === "grid" ? "exhaustive" : `${nIter} combos`})
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5" />
                Run {searchType === "grid" ? "Grid" : "Random"} Search
              </span>
            )}
          </Button>

          {tuneError && (
            <p className="text-xs text-destructive">{tuneError}</p>
          )}
        </div>
      )}

      {/* Results */}
      {tuneResult && (
        <div className="space-y-3">
          {/* Score cards */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 rounded-lg border border-border bg-muted/30">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Baseline</p>
              <p className="text-lg font-bold tabular-nums">
                {tuneResult.baseline_score != null ? tuneResult.baseline_score.toFixed(4) : "\u2014"}
              </p>
              <p className="text-[10px] text-muted-foreground">{tuneResult.scoring_metric}</p>
            </div>
            <div className="p-2.5 rounded-lg border border-violet-500/40 bg-violet-500/10">
              <p className="text-[10px] text-violet-400 uppercase tracking-wider">Tuned ⚡</p>
              <p className="text-lg font-bold tabular-nums text-violet-300">
                {tuneResult.best_score.toFixed(4)}
              </p>
              {delta && (
                <p className={`text-[10px] font-semibold ${delta.improved ? "text-emerald-400" : "text-red-400"}`}>
                  {delta.text}
                </p>
              )}
            </div>
          </div>

          {/* Search stats */}
          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
            <span>Candidates: <strong className="text-foreground">{tuneResult.n_candidates}</strong></span>
            <span>Duration: <strong className="text-foreground">{tuneResult.search_duration_s}s</strong></span>
            <span>Type: <strong className="text-foreground capitalize">{tuneResult.search_type}</strong></span>
          </div>

          {/* Best params */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Best params</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(tuneResult.best_params).map(([k, v]) => (
                <span key={k} className="text-[10px] font-mono bg-muted border border-border rounded px-1.5 py-0.5">
                  {k.replace("model__", "")}={String(v)}
                </span>
              ))}
            </div>
          </div>

          {/* Top candidates table */}
          {tuneResult.cv_results_summary.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors select-none">
                Top {tuneResult.cv_results_summary.length} candidates ▾
              </summary>
              <div className="mt-1.5 overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-1 pr-2 font-medium text-muted-foreground">#</th>
                      <th className="text-right py-1 pr-2 font-medium text-muted-foreground">Score</th>
                      <th className="text-right py-1 font-medium text-muted-foreground">±Std</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tuneResult.cv_results_summary.map((row) => (
                      <tr key={row.rank} className="border-b border-border/50">
                        <td className="py-0.5 pr-2 text-muted-foreground">{row.rank}</td>
                        <td className="py-0.5 pr-2 text-right tabular-nums font-mono">{row.mean_score.toFixed(4)}</td>
                        <td className="py-0.5 text-right tabular-nums text-muted-foreground font-mono">±{row.std_score.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => { setTuneResult(null); setTuneError(null); }}
          >
            ↩ Tune again
          </Button>
        </div>
      )}
    </div>
  );
};

const LeaderboardTable: React.FC<LeaderboardTableProps> = ({ results, task, best, sessionId }) => {
  const primaryMetric = best.primary_metric;

  // Ordered list of displayed quality metric columns
  const metricNames =
    task === "classification"
      ? ["accuracy", "f1", "roc_auc", "balanced_accuracy", "precision", "recall"]
      : ["r2", "rmse", "mae", "mape"];

  // Determine sort direction default: descending for higher-is-better metrics, ascending otherwise
  const lowerIsBetter = new Set(["rmse", "mae", "mape", "inference_time_ms", "training_time_seconds"]);

  const [sortKey, setSortKey] = useState<string>(primaryMetric);
  const [sortDir, setSortDir] = useState<SortDir>(lowerIsBetter.has(primaryMetric) ? "asc" : "desc");
  // Track which row's tune panel is open (by model name, or null)
  const [openTuneRow, setOpenTuneRow] = useState<string | null>(null);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(lowerIsBetter.has(key) ? "asc" : "desc");
    }
  };

  const sorted = useMemo(() => {
    return [...results].sort((a, b) => {
      let av: number;
      let bv: number;
      if (sortKey === "training_time_seconds") {
        av = a.training_time_seconds ?? Infinity;
        bv = b.training_time_seconds ?? Infinity;
      } else if (sortKey === "inference_time_ms") {
        av = a.inference_time_ms ?? Infinity;
        bv = b.inference_time_ms ?? Infinity;
      } else {
        av = a.metrics[sortKey] ?? (sortDir === "desc" ? -Infinity : Infinity);
        bv = b.metrics[sortKey] ?? (sortDir === "desc" ? -Infinity : Infinity);
      }
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [results, sortKey, sortDir]);

  // Max primary metric value across all rows (for sparkline proportions)
  const maxPrimary = useMemo(() => {
    const vals = results.map((r) => r.metrics[primaryMetric] ?? 0).filter((v) => !isNaN(v));
    return vals.length > 0 ? Math.max(...vals) : 1;
  }, [results, primaryMetric]);

  const SortIcon = ({ col }: { col: string }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40 inline" />;
    return sortDir === "desc"
      ? <ArrowDown className="h-3 w-3 ml-1 text-primary inline" />
      : <ArrowUp className="h-3 w-3 ml-1 text-primary inline" />;
  };

  const SortableHead = ({ col, label, className }: { col: string; label: string; className?: string }) => (
    <TableHead
      className={`cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap ${className ?? ""}`}
      onClick={() => handleSort(col)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        <SortIcon col={col} />
      </span>
    </TableHead>
  );

  return (
    <div className="space-y-2">
      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-amber-500/30 border border-amber-500/60" />
          Best model
        </span>
        <span className="flex items-center gap-1.5">
          <ArrowUpDown className="h-3 w-3" />
          Click column to sort
        </span>
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-violet-400" />
          Click Tune to optimise
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="font-semibold min-w-[160px]">Model</TableHead>
              {metricNames.map((metric) => (
                <SortableHead
                  key={metric}
                  col={metric}
                  label={metric.toUpperCase()}
                  className={`text-right ${
                    metric === primaryMetric ? "text-primary font-bold" : ""
                  }`}
                />
              ))}
              {/* Timing columns */}
              <SortableHead col="training_time_seconds" label="Train Time" className="text-right text-muted-foreground" />
              <SortableHead col="inference_time_ms" label="Infer/sample" className="text-right text-muted-foreground" />
              <TableHead className="text-right text-muted-foreground whitespace-nowrap">Tune</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((result) => {
              const isBest = result.model === best.model;
              const primaryVal = result.metrics[primaryMetric];
              const sparkPct = maxPrimary > 0 && !isNaN(primaryVal) ? (primaryVal / maxPrimary) * 100 : 0;
              const isTuneOpen = openTuneRow === result.model;

              return (
                <React.Fragment key={result.model}>
                  <TableRow
                    className={`transition-colors ${
                      isBest
                        ? "bg-amber-500/10 hover:bg-amber-500/15 border-l-2 border-amber-500"
                        : isTuneOpen
                          ? "bg-violet-950/20 border-l-2 border-violet-500"
                          : "hover:bg-muted/30"
                    }`}
                  >
                    {/* Model name cell */}
                    <TableCell className="font-medium">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          {isBest && (
                            <Trophy className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          )}
                          <span className={isBest ? "text-amber-600 dark:text-amber-400 font-semibold" : ""}>
                            {result.model}
                          </span>
                          {isBest && (
                            <Badge
                              className="text-[10px] py-0 px-1.5 h-4 bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40 font-bold"
                              variant="outline"
                            >
                              BEST
                            </Badge>
                          )}
                        </div>
                        {/* Primary metric sparkline */}
                        {!isNaN(primaryVal) && (
                          <div className="w-full h-1 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                isBest ? "bg-amber-500" : "bg-primary/50"
                              }`}
                              style={{ width: `${sparkPct}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </TableCell>

                    {/* Quality metric cells */}
                    {metricNames.map((metric) => {
                      const mean = result.metrics[metric];
                      const std = result.std[metric];
                      const missing = mean === null || mean === undefined || Number.isNaN(mean);
                      const isPrimary = metric === primaryMetric;

                      return (
                        <TableCell
                          key={metric}
                          className={`text-right text-sm tabular-nums ${
                            isPrimary && isBest ? "font-bold text-amber-600 dark:text-amber-400" :
                            isPrimary ? "font-semibold text-primary" : ""
                          }`}
                        >
                          {missing ? (
                            <span className="text-muted-foreground">\u2014</span>
                          ) : (
                            <>
                              <span>{mean.toFixed(3)}</span>
                              <span className="text-muted-foreground text-xs"> \u00b1{std.toFixed(3)}</span>
                            </>
                          )}
                        </TableCell>
                      );
                    })}

                    {/* Timing cells */}
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 justify-end">
                        <Clock className="h-3 w-3" />
                        {fmtTrainTime(result.training_time_seconds)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground whitespace-nowrap">
                      {fmtInferMs(result.inference_time_ms)}
                    </TableCell>

                    {/* Tune button cell */}
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={isTuneOpen ? "default" : "outline"}
                        className={`h-7 text-xs gap-1 transition-all ${
                          isTuneOpen
                            ? "bg-violet-600 hover:bg-violet-500 text-white border-violet-500"
                            : "border-violet-500/40 text-violet-400 hover:border-violet-500 hover:bg-violet-500/10 hover:text-violet-300"
                        }`}
                        onClick={() => setOpenTuneRow(isTuneOpen ? null : result.model)}
                      >
                        <Sparkles className="h-3 w-3" />
                        {isTuneOpen ? "Close" : "Tune"}
                      </Button>
                    </TableCell>
                  </TableRow>

                  {/* Inline tune panel — spans full width via a second row */}
                  {isTuneOpen && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={metricNames.length + 4}
                        className="p-0"
                      >
                        <TunePanel
                          modelName={result.model}
                          sessionId={sessionId}
                          task={task}
                          onClose={() => setOpenTuneRow(null)}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
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

