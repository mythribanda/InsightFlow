import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAnomalyReport, type AnomalyRow } from "@/server/anomaly";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldAlert, AlertTriangle, ChevronDown, ChevronUp, BarChart3, Info } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface AnomalyPanelProps {
  sessionId: string;
}

export const AnomalyPanel: React.FC<AnomalyPanelProps> = ({ sessionId }) => {
  const fetchAnomalyReport = useServerFn(getAnomalyReport);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const { data: anomalies, isLoading, error } = useQuery({
    queryKey: ["anomalyReport", sessionId],
    queryFn: () => fetchAnomalyReport({ session_id: sessionId }),
    enabled: !!sessionId,
  });

  const toggleRow = (rowIndex: number) => {
    const next = new Set(expandedRows);
    if (next.has(rowIndex)) {
      next.delete(rowIndex);
    } else {
      next.add(rowIndex);
    }
    setExpandedRows(next);
  };

  if (!sessionId) {
    return (
      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>No Dataset Loaded</AlertTitle>
        <AlertDescription>
          Please upload a dataset on the Dashboard tab to begin anomaly detection.
        </AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <Card className="border border-border bg-card/50">
        <CardHeader>
          <CardTitle>Anomaly Detection</CardTitle>
          <CardDescription>Identifying out-of-distribution rows using Isolation Forest...</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center p-12 space-y-4">
          <span className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Running Isolation Forest on preprocessed matrix...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Execution Failed</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : "Failed to retrieve anomaly report from backend."}
        </AlertDescription>
      </Alert>
    );
  }

  const hasAnomalies = anomalies && anomalies.length > 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-destructive" />
                Anomaly Detection
              </CardTitle>
              <CardDescription>
                Unsupervised outlier flagging (contamination = 5%) and robust deviation attribution.
              </CardDescription>
            </div>
            {hasAnomalies && (
              <Badge variant="destructive" className="px-3 py-1 text-xs">
                {anomalies.length} anomalous rows flagged
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!hasAnomalies ? (
            <Alert className="bg-green-600/10 border-green-600/20 text-green-400">
              <ShieldAlert className="h-4 w-4 text-green-400" />
              <AlertTitle>No Anomalies Detected</AlertTitle>
              <AlertDescription>
                The Isolation Forest model did not find any records exceeding the outlier threshold in this dataset.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="overflow-hidden rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Row Index</TableHead>
                    <TableHead className="w-[150px]">Anomaly Score</TableHead>
                    <TableHead>Primary Driver</TableHead>
                    <TableHead className="text-right w-[150px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {anomalies.map((row) => {
                    const isExpanded = expandedRows.has(row.row_index);
                    const primaryDriver = row.drivers[0];

                    return (
                      <React.Fragment key={row.row_index}>
                        <TableRow className="hover:bg-muted/50 transition-colors">
                          <TableCell className="font-mono font-medium">#{row.row_index}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-destructive">
                                {row.score.toFixed(3)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {primaryDriver ? (
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="font-mono border-destructive/30 bg-destructive/10 text-destructive-foreground">
                                  {primaryDriver.column}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  (value: {String(primaryDriver.value)}, dev: {primaryDriver.deviation.toFixed(1)})
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleRow(row.row_index)}
                              className="h-8 gap-1 px-3 text-xs"
                            >
                              {isExpanded ? (
                                <>
                                  Hide details <ChevronUp className="h-3 w-3" />
                                </>
                              ) : (
                                <>
                                  Why this row? <ChevronDown className="h-3 w-3" />
                                </>
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={4} className="p-6 border-t border-b border-border">
                              <div className="grid gap-6 md:grid-cols-2">
                                {/* Left Side: Driver analysis */}
                                <div className="space-y-4">
                                  <h4 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                                    <BarChart3 className="h-4 w-4 text-destructive" />
                                    Top Driving Features
                                  </h4>
                                  <p className="text-xs text-muted-foreground leading-relaxed">
                                    Attributed by robust standardized deviation from the column's median value, scaled by its Interquartile Range (IQR). Category columns use value frequency deviation.
                                  </p>
                                  <div className="space-y-3 mt-2">
                                    {row.drivers.map((driver, idx) => {
                                      // Scale helper for the progress bar (max deviation in view, capped at 15 for visualization)
                                      const progressValue = Math.min((driver.deviation / 10) * 100, 100);
                                      let severityVariant = "default";
                                      if (driver.deviation > 5) severityVariant = "destructive";
                                      else if (driver.deviation > 2) severityVariant = "secondary";

                                      return (
                                        <div key={driver.column} className="space-y-1.5 p-3 rounded-lg border border-border/50 bg-card">
                                          <div className="flex items-center justify-between text-xs">
                                            <span className="font-mono font-medium text-foreground">{driver.column}</span>
                                            <span className="font-mono text-muted-foreground">
                                              val: <strong className="text-foreground">{String(driver.value)}</strong> | dev: <strong>{driver.deviation.toFixed(2)}</strong>
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-3">
                                            <Progress value={progressValue} className="h-1.5 bg-muted" />
                                            <Badge
                                              variant={severityVariant === "destructive" ? "destructive" : "secondary"}
                                              className="h-4 text-[9px] px-1.5 py-0 uppercase tracking-wider"
                                            >
                                              {driver.deviation > 5 ? "High" : driver.deviation > 2 ? "Medium" : "Low"}
                                            </Badge>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Right Side: Complete row data */}
                                <div className="space-y-4">
                                  <h4 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                                    <Info className="h-4 w-4 text-primary" />
                                    Raw Row Values
                                  </h4>
                                  <div className="max-h-[220px] overflow-y-auto rounded-lg border border-border bg-card p-3 font-mono text-[10px] space-y-1 scrollbar-thin">
                                    {Object.entries(row.row_data).map(([key, val]) => {
                                      const isDriver = row.drivers.some(d => d.column === key);
                                      return (
                                        <div
                                          key={key}
                                          className={`flex justify-between py-1 border-b border-border/30 last:border-0 px-2 rounded ${
                                            isDriver ? "bg-destructive/5 font-semibold text-destructive-foreground" : "text-muted-foreground"
                                          }`}
                                        >
                                          <span>{key}</span>
                                          <span className="text-foreground">{val === null ? "null" : String(val)}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
