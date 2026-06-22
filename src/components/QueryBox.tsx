import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { queryDataset, type QueryResponse } from "@/server/query";
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
import { Terminal, Send, HelpCircle, Code, Play, ShieldAlert, CheckCircle2 } from "lucide-react";

interface QueryBoxProps {
  sessionId: string;
}

export const QueryBox: React.FC<QueryBoxProps> = ({ sessionId }) => {
  const runQuery = useServerFn(queryDataset);
  const [question, setQuestion] = useState("");
  const [queryResponse, setQueryResponse] = useState<QueryResponse | null>(null);

  const queryMutation = useMutation({
    mutationFn: async (q: string) => {
      if (!sessionId) throw new Error("Please upload a dataset first.");
      if (!q.strip) q = q.trim();
      if (!q) throw new Error("Please enter a question.");
      return runQuery({ session_id: sessionId, question: q });
    },
    onSuccess: (res) => {
      setQueryResponse(res);
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    queryMutation.mutate(question);
  };

  const runSuggestion = (suggestedQuestion: string) => {
    setQuestion(suggestedQuestion);
    queryMutation.mutate(suggestedQuestion);
  };

  const suggestions = [
    "which columns have missing values",
    "top 5 rows by age",
    "total row count",
    "average age",
  ];

  // Formatter for different result structures
  const renderResult = (result: any) => {
    if (result === null || result === undefined) {
      return <span className="text-muted-foreground font-mono">None</span>;
    }

    if (typeof result === "object" && result.type === "dataframe") {
      const dfData = result.data as Record<string, any>[];
      const dfCols = result.columns as string[];

      if (dfData.length === 0) {
        return <p className="text-xs text-muted-foreground">Empty DataFrame</p>;
      }

      return (
        <div className="overflow-x-auto rounded border border-border/80 bg-background/50 max-h-[300px]">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10">
              <TableRow>
                {dfCols.map((col) => (
                  <TableHead key={col} className="font-mono text-xs font-semibold">
                    {col}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {dfData.map((row, idx) => (
                <TableRow key={idx} className="hover:bg-muted/20">
                  {dfCols.map((col) => (
                    <TableCell key={col} className="font-mono text-xs max-w-[200px] truncate">
                      {row[col] === null ? (
                        <span className="text-muted-foreground italic">null</span>
                      ) : (
                        String(row[col])
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );
    }

    if (typeof result === "object" && result.type === "series") {
      const seriesData = result.data as Record<string, any>;
      return (
        <div className="rounded border border-border bg-background/50 max-h-[250px] overflow-y-auto p-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[150px]">Index</TableHead>
                <TableHead>Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(seriesData).map(([key, val]) => (
                <TableRow key={key}>
                  <TableCell className="font-mono font-medium">{key}</TableCell>
                  <TableCell className="font-mono">
                    {val === null ? <span className="text-muted-foreground italic">null</span> : String(val)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );
    }

    if (Array.isArray(result)) {
      if (result.length === 0) return <span className="text-muted-foreground font-mono">[]</span>;
      return (
        <div className="flex flex-wrap gap-2 p-2 rounded border bg-background/40">
          {result.map((item, idx) => (
            <Badge key={idx} variant="outline" className="font-mono text-xs">
              {String(item)}
            </Badge>
          ))}
        </div>
      );
    }

    if (typeof result === "object") {
      return (
        <pre className="text-xs font-mono p-3 bg-background/50 rounded border overflow-x-auto text-foreground">
          {JSON.stringify(result, null, 2)}
        </pre>
      );
    }

    // Scalar values
    return (
      <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 inline-block">
        <span className="text-xl font-bold font-mono text-primary">
          {String(result)}
        </span>
      </div>
    );
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-primary" />
          AI Code Sandbox (NL Query)
        </CardTitle>
        <CardDescription>
          Ask questions using natural language. The engine converts your prompt to pandas code using Groq and executes it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Security Warning Notice */}
        <div className="text-[10px] text-yellow-600/80 bg-yellow-600/10 border border-yellow-600/20 rounded p-2.5 flex gap-2 items-start font-mono leading-relaxed">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-yellow-600" />
          <div>
            <span>NOTICE: </span>
            <span>restricted-builtins is a guard, not a real sandbox; do not deploy publicly without one. Code runs via custom local exec context.</span>
          </div>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. which columns have missing values..."
              className="pr-10"
              disabled={queryMutation.isPending}
            />
            <HelpCircle className="absolute right-3 top-2.5 h-5 w-5 text-muted-foreground/50 pointer-events-none" />
          </div>
          <Button type="submit" disabled={queryMutation.isPending || !question.trim()}>
            {queryMutation.isPending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent mr-1" />
            ) : (
              <Send className="h-4 w-4 mr-1" />
            )}
            Run
          </Button>
        </form>

        {/* Suggestions */}
        <div className="space-y-2">
          <span className="text-xs text-muted-foreground">Try asking:</span>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <Button
                key={s}
                variant="outline"
                size="sm"
                onClick={() => runSuggestion(s)}
                className="text-xs h-7 py-1 px-3"
                disabled={queryMutation.isPending}
              >
                {s}
              </Button>
            ))}
          </div>
        </div>

        {/* Error Alert */}
        {queryMutation.isError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Execution Failed</AlertTitle>
            <AlertDescription>
              {queryMutation.error instanceof Error
                ? queryMutation.error.message
                : "Failed to translate and execute your query."}
            </AlertDescription>
          </Alert>
        )}

        {/* Query Output */}
        {queryResponse && (
          <div className="space-y-4 pt-2 border-t border-border">
            {/* Generated Code Section */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                <Code className="h-4 w-4 text-primary" />
                Generated Pandas Code (Auditable)
              </h4>
              <div className="relative rounded-lg overflow-hidden border border-border/80 bg-muted/30">
                <pre className="text-xs font-mono p-4 text-emerald-400 overflow-x-auto select-all leading-relaxed whitespace-pre-wrap">
                  {queryResponse.code}
                </pre>
                <Badge variant="outline" className="absolute right-3 top-3 border-emerald-500/25 bg-emerald-500/10 text-emerald-400">
                  <Play className="h-3 w-3 mr-1 fill-emerald-400/20" /> Executed
                </Badge>
              </div>
            </div>

            {/* Execution Result Section */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Execution Output
              </h4>
              <div className="p-1 rounded-lg border border-border/80 bg-muted/10">
                {renderResult(queryResponse.result)}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
