import React, { useState, useMemo } from "react";
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
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  TrendingUp,
  Percent,
  Play,
  RotateCcw,
  Sparkles,
  BarChart,
  Binary,
} from "lucide-react";
import { type DatasetProfile } from "@/lib/profiler";
import { runStatisticalTest, type StatsResponse } from "@/server/statistics";
import { MetricCard } from "@/components/MetricCard";
import { motion } from "framer-motion";
import { panelVariants } from "@/hooks/useAnimationVariants";

interface StatisticsPanelProps {
  sessionId: string;
  profile: DatasetProfile | null;
}

type TestType = "t_test" | "z_test" | "anova" | "chi_square" | "confidence_interval";

export const StatisticsPanel: React.FC<StatisticsPanelProps> = ({
  sessionId,
  profile,
}) => {
  const runTest = useServerFn(runStatisticalTest);

  // Form states
  const [testType, setTestType] = useState<TestType>("t_test");
  const [selectedColumn, setSelectedColumn] = useState<string>("");
  const [selectedGroupCol, setSelectedGroupCol] = useState<string>("");
  const [confidence, setConfidence] = useState<number>(0.95);

  // Results states
  const [statsResult, setStatsResult] = useState<StatsResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Column lists based on types
  const numericColumns = useMemo(() => {
    if (!profile) return [];
    return profile.columns.filter((c) => c.type === "numeric").map((c) => c.name);
  }, [profile]);

  const categoricalColumns = useMemo(() => {
    if (!profile) return [];
    // Allow categorical, boolean, text, id, or low-cardinality numeric columns to be used as grouping
    return profile.columns
      .filter((c) => c.type !== "numeric" || c.unique <= 10)
      .map((c) => c.name);
  }, [profile]);

  const allColumns = useMemo(() => {
    if (!profile) return [];
    return profile.columns.map((c) => c.name);
  }, [profile]);

  // Dynamic reset when test type changes
  const handleTestTypeChange = (type: TestType) => {
    setTestType(type);
    setSelectedColumn("");
    setSelectedGroupCol("");
    setStatsResult(null);
    setErrorMsg(null);
  };

  const testMutation = useMutation({
    mutationFn: async () => {
      setErrorMsg(null);
      if (!selectedColumn) throw new Error("Please select the primary column");
      if (
        (testType === "t_test" || testType === "z_test" || testType === "anova" || testType === "chi_square") &&
        !selectedGroupCol
      ) {
        throw new Error(
          testType === "chi_square"
            ? "Please select the second column"
            : "Please select the grouping column"
        );
      }

      return runTest({
        data: {
          session_id: sessionId,
          test_type: testType,
          column: selectedColumn,
          group_column: selectedGroupCol || undefined,
          confidence: testType === "confidence_interval" ? confidence : undefined,
        },
      });
    },
    onSuccess: (res) => {
      setStatsResult(res);
    },
    onError: (err) => {
      setErrorMsg(err instanceof Error ? err.message : "Statistical test failed");
    },
  });

  const handleReset = () => {
    setSelectedColumn("");
    setSelectedGroupCol("");
    setConfidence(0.95);
    setStatsResult(null);
    setErrorMsg(null);
  };

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <AlertTriangle className="h-8 w-8 text-warning mb-3" />
        <p className="text-sm text-muted-foreground">
          No dataset loaded. Please import or select a dataset first.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      className="space-y-6"
      variants={panelVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Test Setup Card */}
      <Card className="border-violet-500/20 bg-gradient-to-br from-violet-950/10 via-transparent to-transparent">
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart className="h-5 w-5 text-violet-400" />
            <CardTitle>Statistical Hypothesis Testing</CardTitle>
          </div>
          <CardDescription>
            Select columns and perform statistical tests to find meaningful relationships in your data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Test Type Select */}
            <div className="space-y-2 text-left">
              <label className="text-xs font-semibold text-muted-foreground">Test Type</label>
              <Select value={testType} onValueChange={(val) => handleTestTypeChange(val as TestType)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select test type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="t_test">Independent Samples T-Test</SelectItem>
                  <SelectItem value="z_test">Two-Sample Z-Test</SelectItem>
                  <SelectItem value="anova">One-Way ANOVA</SelectItem>
                  <SelectItem value="chi_square">Chi-Square Independence</SelectItem>
                  <SelectItem value="confidence_interval">Confidence Interval</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Column 1 (Dependent) */}
            <div className="space-y-2 text-left">
              <label className="text-xs font-semibold text-muted-foreground">
                {testType === "chi_square" ? "First Column (Categorical)" : "Numeric Column"}
              </label>
              <Select value={selectedColumn} onValueChange={setSelectedColumn}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select column..." />
                </SelectTrigger>
                <SelectContent>
                  {testType === "chi_square"
                    ? allColumns.map((col) => (
                        <SelectItem key={col} value={col}>
                          {col}
                        </SelectItem>
                      ))
                    : numericColumns.map((col) => (
                        <SelectItem key={col} value={col}>
                          {col}
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
            </div>

            {/* Column 2 / Group Column */}
            {testType !== "confidence_interval" && (
              <div className="space-y-2 text-left">
                <label className="text-xs font-semibold text-muted-foreground">
                  {testType === "chi_square" ? "Second Column (Categorical)" : "Grouping Column"}
                </label>
                <Select value={selectedGroupCol} onValueChange={setSelectedGroupCol}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select column..." />
                  </SelectTrigger>
                  <SelectContent>
                    {testType === "chi_square"
                      ? allColumns.map((col) => (
                          <SelectItem key={col} value={col}>
                            {col}
                          </SelectItem>
                        ))
                      : categoricalColumns.map((col) => (
                          <SelectItem key={col} value={col}>
                            {col}
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Confidence Slider (CI Only) */}
            {testType === "confidence_interval" && (
              <div className="space-y-2 text-left">
                <label className="text-xs font-semibold text-muted-foreground">Confidence Level</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0.8}
                    max={0.99}
                    step={0.01}
                    value={confidence}
                    onChange={(e) => setConfidence(Number(e.target.value))}
                    className="flex-1 accent-violet-500"
                  />
                  <span className="text-xs font-mono text-violet-300 w-12 text-right">
                    {(confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2.5 pt-2">
            <Button
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
              className="bg-violet-600 hover:bg-violet-500 text-white font-semibold flex-1 gap-2"
            >
              {testMutation.isPending ? (
                <>
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  Calculating...
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  Run Statistical Test
                </>
              )}
            </Button>
            <Button variant="outline" onClick={handleReset} className="gap-2">
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          </div>

          {errorMsg && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Calculation Error</AlertTitle>
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Results View */}
      {statsResult && (
        <div className="space-y-6 animate-in slide-in-from-top-3 duration-300">
          {/* Significance Card */}
          <Card className="border-border/60 overflow-hidden relative">
            {statsResult.significant && testType !== "confidence_interval" && (
              <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
            )}
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-400" />
                  Analysis Results
                </CardTitle>
              </div>
              {testType !== "confidence_interval" && (
                <Badge
                  variant={statsResult.significant ? "default" : "secondary"}
                  className={
                    statsResult.significant
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-bold"
                      : "bg-muted text-muted-foreground font-bold"
                  }
                >
                  {statsResult.significant ? "Significant" : "Not Significant"}
                </Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              {(() => {
                const info = statsResult.extra_info;
                return (
                  <>
                    {/* Natural Language Interpretation */}
                    <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-4 text-left">
                      <p className="text-sm leading-relaxed text-foreground whitespace-pre-line">
                        {statsResult.interpretation}
                      </p>
                    </div>

                    {/* Statistics Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* Statistic Card */}
                      <MetricCard
                        label={
                          testType === "t_test"
                            ? "T-Statistic"
                            : testType === "z_test"
                              ? "Z-Statistic"
                              : testType === "anova"
                                ? "F-Statistic"
                                : testType === "chi_square"
                                  ? "Chi-Square (χ²)"
                                  : "Estimated Mean"
                        }
                        value={statsResult.statistic.toFixed(4)}
                        icon={Binary}
                        accent="primary"
                      />

                      {/* P-Value Card */}
                      {testType !== "confidence_interval" && (
                        <MetricCard
                          label="P-Value"
                          value={
                            statsResult.p_value < 0.0001
                              ? "< 0.0001"
                              : statsResult.p_value.toFixed(5)
                          }
                          icon={Percent}
                          accent={statsResult.significant ? "success" : "warning"}
                          hint={
                            statsResult.significant
                              ? "Reject Null Hypothesis (p < 0.05)"
                              : "Fail to Reject Null Hypothesis"
                          }
                        />
                      )}

                      {/* Extra Stats Cards */}
                      {testType === "confidence_interval" && info && (
                        <>
                          <MetricCard
                            label="Margin of Error"
                            value={`±${info.margin_of_error.toFixed(4)}`}
                            icon={Percent}
                            accent="accent"
                          />
                          <MetricCard
                            label="95% Confidence Interval"
                            value={`[${info.lower_bound.toFixed(3)}, ${info.upper_bound.toFixed(3)}]`}
                            icon={TrendingUp}
                            accent="success"
                          />
                        </>
                      )}
                    </div>

                    {/* Extra visualization/tables based on test type */}
                    {(testType === "t_test" || testType === "z_test") && info && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-left">Group Means Comparison</h4>
                        <div className="rounded-lg border border-border overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/40">
                                <TableHead>Group ({selectedGroupCol})</TableHead>
                                <TableHead className="text-right">Sample Size (N)</TableHead>
                                <TableHead className="text-right">Mean ({selectedColumn})</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              <TableRow>
                                <TableCell className="font-semibold">{info.group1_name}</TableCell>
                                <TableCell className="text-right font-mono">{info.group1_count}</TableCell>
                                <TableCell className="text-right font-mono">{info.group1_mean.toFixed(4)}</TableCell>
                              </TableRow>
                              <TableRow>
                                <TableCell className="font-semibold">{info.group2_name}</TableCell>
                                <TableCell className="text-right font-mono">{info.group2_count}</TableCell>
                                <TableCell className="text-right font-mono">{info.group2_mean.toFixed(4)}</TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}

                    {testType === "anova" && info && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-left">Group Means Comparison</h4>
                        <div className="rounded-lg border border-border overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/40">
                                <TableHead>Group ({selectedGroupCol})</TableHead>
                                <TableHead className="text-right">Sample Size (N)</TableHead>
                                <TableHead className="text-right">Mean ({selectedColumn})</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {Object.entries(info.group_means).map(([name, groupInfo]: [string, any]) => (
                                <TableRow key={name}>
                                  <TableCell className="font-semibold">{name}</TableCell>
                                  <TableCell className="text-right font-mono">{groupInfo.count}</TableCell>
                                  <TableCell className="text-right font-mono">{groupInfo.mean.toFixed(4)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}

                    {testType === "chi_square" && info && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-left">Contingency Crosstabulation (Actual Counts)</h4>
                        <div className="rounded-lg border border-border overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/40">
                                <TableHead>{selectedColumn} \ {selectedGroupCol}</TableHead>
                                {info.columns.map((cName: string) => (
                                  <TableHead key={cName} className="text-right">{cName}</TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {info.index.map((rName: string, rIdx: number) => (
                                <TableRow key={rName}>
                                  <TableCell className="font-semibold">{rName}</TableCell>
                                  {info.contingency_table[rIdx].map((val: number, cIdx: number) => (
                                    <TableCell key={cIdx} className="text-right font-mono">
                                      {val}
                                    </TableCell>
                                  ))}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      )}
    </motion.div>
  );
};
export default StatisticsPanel;
