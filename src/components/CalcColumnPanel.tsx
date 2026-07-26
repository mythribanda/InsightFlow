import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { addCalcColumn } from "@/server/analysis";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Calculator, Plus, HelpCircle, AlertTriangle, CheckCircle2, List } from "lucide-react";

interface CalcColumnPanelProps {
  sessionId: string;
  rows: Record<string, unknown>[];
  headers: string[];
  onColumnCreated: (name: string, allValues: any[]) => void;
  /** If provided, a version snapshot will be written to this project after column creation */
  projectId?: string;
  initialName?: string;
  initialFormula?: string;
  onClearInitials?: () => void;
}

export const CalcColumnPanel: React.FC<CalcColumnPanelProps> = ({
  sessionId,
  rows,
  headers,
  onColumnCreated,
  projectId,
  initialName,
  initialFormula,
  onClearInitials,
}) => {
  const runAddCalcColumn = useServerFn(addCalcColumn);
  const [name, setName] = useState(initialName || "");
  const [formula, setFormula] = useState(initialFormula || "");

  React.useEffect(() => {
    if (initialName !== undefined && initialName !== "") setName(initialName);
    if (initialFormula !== undefined && initialFormula !== "") setFormula(initialFormula);
    if (initialName || initialFormula) {
      onClearInitials?.();
    }
  }, [initialName, initialFormula, onClearInitials]);
  const [previewValues, setPreviewValues] = useState<any[] | null>(null);
  const [createdName, setCreatedName] = useState("");

  const calcMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error("Please upload a dataset first.");
      const cleanName = name.trim();
      const cleanFormula = formula.trim();
      if (!cleanName) throw new Error("Please enter a column name.");
      if (!cleanFormula) throw new Error("Please enter a formula.");

      // Convert rows (array of objects) to column-oriented dictionary of arrays
      const dataDict: Record<string, unknown[]> = {};
      headers.forEach((h) => {
        dataDict[h] = rows.map((r) => r[h]);
      });

      const response = await runAddCalcColumn({
        data: {
          session_id: sessionId,
          name: cleanName,
          formula: cleanFormula,
          data: dataDict,
          project_id: projectId,
        },
      });

      if (!response.success) {
        throw new Error(response.error || "Failed to create calculated column.");
      }

      return { name: cleanName, preview: response.preview || [] };
    },
    onSuccess: (data) => {
      setPreviewValues(data.preview);
      setCreatedName(data.name);
      // Callback to update parent rows & profile immediately
      onColumnCreated(data.name, data.preview);
      // Clear inputs
      setName("");
      setFormula("");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    calcMutation.mutate();
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-primary" />
          Calculated Columns
        </CardTitle>
        <CardDescription>
          Add a new column computed using a secure formula evaluator. Only whitelisted functions (IF, ROUND, ABS, AVG, SUM, COUNT) and basic math are supported.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-1">
              <label className="text-xs font-semibold text-foreground">Column Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. bonus"
                disabled={calcMutation.isPending}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-semibold text-foreground">Formula</label>
              <div className="relative">
                <Input
                  value={formula}
                  onChange={(e) => setFormula(e.target.value)}
                  placeholder="e.g. ROUND(salary * 0.1, 2)"
                  disabled={calcMutation.isPending}
                  className="pr-10"
                />
                <HelpCircle className="absolute right-3 top-2.5 h-5 w-5 text-muted-foreground/40 pointer-events-none" />
              </div>
            </div>
          </div>

          <Button type="submit" disabled={calcMutation.isPending || !name.trim() || !formula.trim()} className="w-full sm:w-auto">
            {calcMutation.isPending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent mr-2" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Create Column
          </Button>
        </form>

        {/* Formula Guide */}
        <div className="rounded-lg border border-border/80 bg-muted/20 p-4">
          <h4 className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
            <List className="h-3.5 w-3.5 text-primary" />
            Formula Guide & Examples
          </h4>
          <ul className="text-xs text-muted-foreground space-y-2 leading-relaxed">
            <li>
              <code className="bg-background px-1.5 py-0.5 rounded border text-primary">ROUND(salary * 0.1, 2)</code> — Computes 10% bonus rounded to 2 decimal places.
            </li>
            <li>
              <code className="bg-background px-1.5 py-0.5 rounded border text-primary">IF(age &gt; 30, "senior", "junior")</code> — Returns "senior" if age is greater than 30, else "junior".
            </li>
            <li>
              <code className="bg-background px-1.5 py-0.5 rounded border text-primary">ROUND(salary / AVG(salary), 4)</code> — Computes ratio of salary compared to the overall average.
            </li>
            <li>
              <code className="bg-background px-1.5 py-0.5 rounded border text-primary">`sepal length (cm)` * 0.5</code> — Use backticks to reference columns with spaces or special characters.
            </li>
          </ul>
        </div>

        {/* Error Alert */}
        {calcMutation.isError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Creation Failed</AlertTitle>
            <AlertDescription>
              {calcMutation.error instanceof Error
                ? calcMutation.error.message
                : "Failed to evaluate formula."}
            </AlertDescription>
          </Alert>
        )}

        {/* Success Preview */}
        {previewValues && (
          <div className="space-y-4 pt-4 border-t border-border">
            <h4 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Column '{createdName}' Created Successfully
            </h4>
            <div className="space-y-2">
              <span className="text-xs text-muted-foreground">Preview of first 10 rows:</span>
              <div className="overflow-x-auto rounded border border-border/80 bg-background/50 max-h-[250px]">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="font-mono text-xs w-[120px]">Row Index</TableHead>
                      <TableHead className="font-mono text-xs font-semibold text-primary">{createdName}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewValues.slice(0, 10).map((val, idx) => (
                      <TableRow key={idx} className="hover:bg-muted/20">
                        <TableCell className="font-mono text-xs">{idx}</TableCell>
                        <TableCell className="font-mono text-xs font-medium">
                          {val === null || val === undefined ? (
                            <span className="text-muted-foreground italic">null</span>
                          ) : (
                            String(val)
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
