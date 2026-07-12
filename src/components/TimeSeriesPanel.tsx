import React, { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  decomposeTimeSeries,
  forecastTimeSeries,
  DecomposeResponse,
  ForecastResponse,
} from "@/server/timeseries";
import { DatasetProfile, ColumnProfile } from "@/lib/profiler";
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
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Area,
} from "recharts";
import {
  Loader2,
  TrendingUp,
  LineChart as ChartIcon,
  Calendar,
  Layers,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { motion } from "framer-motion";
import { panelVariants } from "@/hooks/useAnimationVariants";

interface TimeSeriesPanelProps {
  sessionId: string;
  profile: DatasetProfile;
  rows?: Record<string, unknown>[];
}

interface ChartPoint {
  date: string;
  observed: number | null;
  forecast: number | null;
  lower: number | null;
  upper: number | null;
}

export const TimeSeriesPanel: React.FC<TimeSeriesPanelProps> = ({
  sessionId,
  profile,
  rows = [],
}) => {
  const columns = profile?.columns.map((c: ColumnProfile) => c.name) || [];
  
  const [selectedDateCol, setSelectedDateCol] = useState<string>("");
  const [selectedValCol, setSelectedValCol] = useState<string>("");
  const [forecastMethod, setForecastMethod] = useState<string>("arima");
  const [periods, setPeriods] = useState<number>(30);
  const [showRolling, setShowRolling] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (columns.length > 0) {
      const dateKeywords = ["date", "time", "timestamp", "datetime", "created_at", "updated_at", "year", "month", "day"];
      const detectedDate = columns.find((col: string) =>
        dateKeywords.some((kw) => col.toLowerCase().includes(kw))
      );
      if (detectedDate) {
        setSelectedDateCol(detectedDate);
      } else {
        setSelectedDateCol(columns[0]);
      }

      const detectedVal = profile?.columns.find(
        (c: ColumnProfile) => c.type === "numeric" && c.name !== detectedDate
      );
      if (detectedVal) {
        setSelectedValCol(detectedVal.name);
      } else {
        const fallbackVal = columns.find((c: string) => c !== detectedDate);
        setSelectedValCol(fallbackVal || columns[0]);
      }
    }
  }, [profile]);

  const runDecompose = useServerFn(decomposeTimeSeries);
  const runForecast = useServerFn(forecastTimeSeries);

  const timeseriesMutation = useMutation({
    mutationFn: async () => {
      setError(null);
      if (!selectedDateCol || !selectedValCol) {
        throw new Error("Please select both a datetime column and a numeric value column.");
      }

      const [decompData, forecastData] = await Promise.all([
        runDecompose({
          data: {
            session_id: sessionId,
            date_column: selectedDateCol,
            value_column: selectedValCol,
          },
        }),
        runForecast({
          data: {
            session_id: sessionId,
            method: forecastMethod,
            date_column: selectedDateCol,
            value_column: selectedValCol,
            periods: periods,
          },
        }),
      ]);

      return { decompData, forecastData };
    },
    onError: (err: any) => {
      setError(err?.message || "Time series analysis failed.");
    },
  });

  const { data: results } = timeseriesMutation;

  const getDecompChartData = () => {
    if (!results?.decompData) return [];
    const d = results.decompData;
    return d.dates.map((date, i) => ({
      date,
      observed: d.observed[i],
      trend: d.trend[i],
      seasonal: d.seasonal[i],
      residual: d.residual[i],
      rolling_mean: d.rolling_mean[i],
      rolling_std_upper: d.rolling_mean[i] + d.rolling_std[i],
      rolling_std_lower: d.rolling_mean[i] - d.rolling_std[i],
    }));
  };

  const getForecastChartData = () => {
    if (!results?.forecastData || !results?.decompData) return [];
    const decomp = results.decompData;
    const fore = results.forecastData;

    const history: ChartPoint[] = decomp.dates.map((date, i) => ({
      date,
      observed: decomp.observed[i],
      forecast: null,
      lower: null,
      upper: null,
    }));

    const future: ChartPoint[] = fore.dates.map((date, i) => ({
      date,
      observed: null,
      forecast: fore.forecast[i],
      lower: fore.lower_bound[i],
      upper: fore.upper_bound[i],
    }));

    if (history.length > 0 && future.length > 0) {
      future[0].observed = history[history.length - 1].observed;
    }

    return [...history, ...future];
  };

  const decompChartData = getDecompChartData();
  const forecastChartData = getForecastChartData();

  return (
    <motion.div
      className="space-y-6"
      variants={panelVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Configuration Header Card */}
      <Card className="border-border/60">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-violet-400" />
            <div>
              <CardTitle className="text-base text-left">Time Series Analyzer</CardTitle>
              <CardDescription className="text-left">
                Decompose seasonality, overlay rolling metrics, and predict future periods.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-5 items-end">
            {/* Datetime Column Selector */}
            <div className="flex flex-col space-y-1.5 text-left">
              <label className="text-xs font-semibold text-muted-foreground mb-1">Datetime Column</label>
              <Select value={selectedDateCol} onValueChange={setSelectedDateCol}>
                <SelectTrigger id="date-col" className="w-full">
                  <SelectValue placeholder="Select column..." />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((c: string) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Target Value Column Selector */}
            <div className="flex flex-col space-y-1.5 text-left">
              <label className="text-xs font-semibold text-muted-foreground mb-1">Numeric Value</label>
              <Select value={selectedValCol} onValueChange={setSelectedValCol}>
                <SelectTrigger id="val-col" className="w-full">
                  <SelectValue placeholder="Select column..." />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((c: string) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Method Selector */}
            <div className="flex flex-col space-y-1.5 text-left">
              <label className="text-xs font-semibold text-muted-foreground mb-1">Forecast Method</label>
              <Select value={forecastMethod} onValueChange={setForecastMethod}>
                <SelectTrigger id="method" className="w-full">
                  <SelectValue placeholder="Select method..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="arima">ARIMA (Baseline)</SelectItem>
                  <SelectItem value="sarima">SARIMA (Seasonal)</SelectItem>
                  <SelectItem value="prophet">Prophet (Nonlinear)</SelectItem>
                  <SelectItem value="lstm">LSTM (PyTorch RNN)</SelectItem>
                  <SelectItem value="gru">GRU (PyTorch RNN)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Periods input */}
            <div className="flex flex-col space-y-1.5 text-left">
              <label className="text-xs font-semibold text-muted-foreground mb-1">Periods Ahead</label>
              <Input
                id="periods"
                type="number"
                min={1}
                max={365}
                value={periods}
                onChange={(e) => setPeriods(Math.max(1, Number(e.target.value) || 30))}
              />
            </div>

            {/* Run Button */}
            <Button
              className="w-full cursor-pointer"
              onClick={() => timeseriesMutation.mutate()}
              disabled={timeseriesMutation.isPending}
            >
              {timeseriesMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Analyzing...
                </>
              ) : (
                <>
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Run Analysis
                </>
              )}
            </Button>
          </div>

          {error && (
            <Alert variant="destructive" className="mt-4 text-left">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Analysis Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Results View */}
      {results && (
        <div className="space-y-6 animate-in fade-in duration-300">
          
          {/* 1. Forecast Card */}
          <Card className="border-border/60">
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <div className="text-left">
                <CardTitle className="text-base flex items-center gap-2">
                  <ChartIcon className="h-4.5 w-4.5 text-violet-400" />
                  Future Forecast Projection
                </CardTitle>
                <CardDescription>
                  Forward prediction with a shaded 95% confidence interval band.
                </CardDescription>
              </div>
              <Badge variant="secondary" className="font-mono text-[10px] py-0.5">
                Method: {forecastMethod.toUpperCase()}
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="h-[320px] w-full mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={forecastChartData} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="var(--color-grid)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }}
                    />
                    <YAxis tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--color-popover)",
                        borderColor: "var(--color-border)",
                        fontSize: "11px",
                        color: "var(--color-popover-foreground)",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "10px" }} />
                    
                    <Area
                      type="monotone"
                      dataKey="upper"
                      stroke="none"
                      fill="var(--color-primary)"
                      fillOpacity={0.12}
                      connectNulls
                      legendType="none"
                    />
                    <Area
                      type="monotone"
                      dataKey="lower"
                      stroke="none"
                      fill="var(--color-background)"
                      fillOpacity={1.0}
                      connectNulls
                      legendType="none"
                    />

                    <Line
                      type="monotone"
                      dataKey="observed"
                      name="Observed (History)"
                      stroke="oklch(0.65 0.24 300)"
                      dot={false}
                      strokeWidth={2.5}
                      connectNulls
                    />

                    <Line
                      type="monotone"
                      dataKey="forecast"
                      name="Forecast (Prediction)"
                      stroke="oklch(0.75 0.18 65)"
                      dot={false}
                      strokeWidth={2.5}
                      strokeDasharray="4 4"
                      connectNulls
                    />

                    <Line
                      type="monotone"
                      dataKey="upper"
                      name="Upper Bound"
                      stroke="var(--color-primary)"
                      dot={false}
                      strokeWidth={1}
                      strokeDasharray="2 2"
                      opacity={0.5}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="lower"
                      name="Lower Bound"
                      stroke="var(--color-primary)"
                      dot={false}
                      strokeWidth={1}
                      strokeDasharray="2 2"
                      opacity={0.5}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* 2. Decomposition Card */}
          <Card className="border-border/60">
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <div className="text-left">
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-4.5 w-4.5 text-violet-400" />
                  Time Series Decomposition & Rolling Stats
                </CardTitle>
                <CardDescription>
                  Separating the series into underlying trend, cyclical seasonality, and random residual noise.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowRolling(!showRolling)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    showRolling ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out ${
                      showRolling ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
                <span className="text-xs font-medium cursor-pointer" onClick={() => setShowRolling(!showRolling)}>
                  Rolling Stats Overlay
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">Observed vs Trend Component</span>
                  {showRolling && (
                    <Badge variant="outline" className="text-[10px] border-violet-500/30 text-violet-400 font-bold">
                      7-Period Rolling Stats Active
                    </Badge>
                  )}
                </div>
                <div className="h-[200px] w-full border border-border/50 rounded-lg p-2 bg-muted/5">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={decompChartData} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
                      <CartesianGrid stroke="var(--color-grid)" strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }} />
                      <YAxis tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--color-popover)",
                          borderColor: "var(--color-border)",
                          fontSize: "11px",
                          color: "var(--color-popover-foreground)",
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: "10px" }} />

                      {showRolling && (
                        <Area
                          type="monotone"
                          dataKey="rolling_std_upper"
                          stroke="none"
                          fill="var(--color-primary)"
                          fillOpacity={0.08}
                          legendType="none"
                        />
                      )}
                      {showRolling && (
                        <Area
                          type="monotone"
                          dataKey="rolling_std_lower"
                          stroke="none"
                          fill="var(--color-background)"
                          fillOpacity={1.0}
                          legendType="none"
                        />
                      )}

                      <Line
                        type="monotone"
                        dataKey="observed"
                        name="Observed (Actual)"
                        stroke="oklch(0.65 0.24 300)"
                        dot={false}
                        strokeWidth={1.5}
                      />
                      <Line
                        type="monotone"
                        dataKey="trend"
                        name="Trend Line"
                        stroke="oklch(0.75 0.18 65)"
                        dot={false}
                        strokeWidth={2}
                      />
                      {showRolling && (
                        <Line
                          type="monotone"
                          dataKey="rolling_mean"
                          name="Rolling Average"
                          stroke="var(--color-primary)"
                          dot={false}
                          strokeWidth={1.5}
                          strokeDasharray="3 3"
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-semibold text-foreground flex text-left">Seasonality Component</span>
                <div className="h-[120px] w-full border border-border/50 rounded-lg p-2 bg-muted/5">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={decompChartData} margin={{ top: 5, right: 15, left: -20, bottom: 0 }}>
                      <CartesianGrid stroke="var(--color-grid)" strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 8, fill: "var(--color-muted-foreground)" }} />
                      <YAxis tick={{ fontSize: 8, fill: "var(--color-muted-foreground)" }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--color-popover)",
                          borderColor: "var(--color-border)",
                          fontSize: "10px",
                          color: "var(--color-popover-foreground)",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="seasonal"
                        name="Seasonality"
                        stroke="oklch(0.78 0.17 195)"
                        dot={false}
                        strokeWidth={1.5}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-semibold text-foreground flex text-left">Residual (Random Noise)</span>
                <div className="h-[120px] w-full border border-border/50 rounded-lg p-2 bg-muted/5">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={decompChartData} margin={{ top: 5, right: 15, left: -20, bottom: 0 }}>
                      <CartesianGrid stroke="var(--color-grid)" strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 8, fill: "var(--color-muted-foreground)" }} />
                      <YAxis tick={{ fontSize: 8, fill: "var(--color-muted-foreground)" }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--color-popover)",
                          borderColor: "var(--color-border)",
                          fontSize: "10px",
                          color: "var(--color-popover-foreground)",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="residual"
                        name="Residuals"
                        stroke="oklch(0.66 0.22 305)"
                        dot={false}
                        strokeWidth={1.5}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </CardContent>
          </Card>
        </div>
      )}
    </motion.div>
  );
};
