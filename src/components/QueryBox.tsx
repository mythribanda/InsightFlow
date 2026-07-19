import React, { useState, useMemo, useRef, useEffect } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { sql } from "@codemirror/lang-sql";
import { EditorView } from "@codemirror/view";
import { DatasetProfile } from "@/lib/profiler";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { queryDataset, sqlQueryDataset, saveQuery, listSavedQueries, deleteSavedQuery, type QueryResponse, type SQLQueryResponse } from "@/server/query";
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
import { Terminal, Send, HelpCircle, Code, Play, ShieldAlert, CheckCircle2, AlertTriangle, Database, X, Download } from "lucide-react";

interface QueryBoxProps {
  sessionId: string;
  profile?: DatasetProfile;
  projectId?: string;
}

export const QueryBox: React.FC<QueryBoxProps> = ({ sessionId, profile, projectId }) => {
  const runQuery = useServerFn(queryDataset);
  const runSqlQuery = useServerFn(sqlQueryDataset);

  const [queryMode, setQueryMode] = useState<"nl" | "sql">("nl");
  const [question, setQuestion] = useState("");
  const [queryResponse, setQueryResponse] = useState<QueryResponse | null>(null);

  // SQL State
  const [sqlQuery, setSqlQuery] = useState("SELECT * FROM dataset LIMIT 10");
  const [sqlResult, setSqlResult] = useState<SQLQueryResponse | null>(null);
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [sqlRunning, setSqlRunning] = useState(false);

  const [isSchemaOpen, setIsSchemaOpen] = useState(true);
  const editorViewRef = useRef<EditorView | null>(null);

  const sqlExtension = useMemo(() => {
    const cols = profile?.columns.map((c) => c.name) || [];
    return sql({
      schema: {
        dataset: cols,
      },
    });
  }, [profile]);

  const completionsList = useMemo(() => {
    if (!profile) return [];
    return profile.columns.map((c) => ({
      label: c.name,
      type: "property",
      detail: ` (${c.type})`,
      info: `Column: ${c.name}\nType: ${c.type}\nUnique: ${c.unique}\nMissing: ${c.missing} (${(c.missingPct * 100).toFixed(1)}%)`,
    }));
  }, [profile]);

  const customCompletionSource = (context: any) => {
    const word = context.matchBefore(/\w*/);
    if (word.from === word.to && !context.explicit) return null;
    return {
      from: word.from,
      options: completionsList,
    };
  };

  const handleInsertColumn = (colName: string) => {
    const view = editorViewRef.current;
    if (!view) {
      setSqlQuery((prev) => prev + " " + colName);
      return;
    }

    const { state, dispatch } = view;
    const { selection } = state;
    const mainSelection = selection.main;

    dispatch({
      changes: {
        from: mainSelection.from,
        to: mainSelection.to,
        insert: colName,
      },
      selection: { anchor: mainSelection.from + colName.length },
      userEvent: "input",
    });

    view.focus();
  };

  const [activeSidebarTab, setActiveSidebarTab] = useState<"schema" | "queries">("schema");
  const [activeQueriesTab, setActiveQueriesTab] = useState<"history" | "saved">("history");
  
  const [history, setHistory] = useState<{ id: string; query: string; timestamp: string; duration_ms?: number }[]>(() => {
    try {
      const saved = localStorage.getItem(`insightflow_sql_history_${sessionId}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [localSavedQueries, setLocalSavedQueries] = useState<{ id: string; name: string; query_text: string; created_at: string }[]>(() => {
    try {
      const saved = localStorage.getItem(`insightflow_saved_queries`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // DB Saved Queries Query
  const { data: dbSavedQueries, refetch: refetchSavedQueries } = useQuery({
    queryKey: ["saved_queries", projectId],
    queryFn: () => listSavedQueries({ data: projectId! }),
    enabled: !!projectId,
  });

  const savedQueriesList = projectId ? (dbSavedQueries || []) : localSavedQueries;

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveQueryName, setSaveQueryName] = useState("");

  const saveQueryMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!name.trim()) throw new Error("Please enter a name.");
      if (projectId) {
        return saveQuery({
          data: {
            project_id: projectId,
            name: name.trim(),
            query_text: sqlQuery,
          },
        });
      } else {
        const newSaved = {
          id: Math.random().toString(36).substring(2, 9),
          name: name.trim(),
          query_text: sqlQuery,
          created_at: new Date().toISOString(),
        };
        setLocalSavedQueries((prev) => {
          const next = [newSaved, ...prev];
          localStorage.setItem(`insightflow_saved_queries`, JSON.stringify(next));
          return next;
        });
        return newSaved;
      }
    },
    onSuccess: () => {
      if (projectId) {
        refetchSavedQueries();
      }
      setIsSaveModalOpen(false);
      setSaveQueryName("");
    },
  });

  const deleteQueryMutation = useMutation({
    mutationFn: async (id: string) => {
      if (projectId) {
        return deleteSavedQuery({ data: id });
      } else {
        setLocalSavedQueries((prev) => {
          const next = prev.filter((q) => q.id !== id);
          localStorage.setItem(`insightflow_saved_queries`, JSON.stringify(next));
          return next;
        });
      }
    },
    onSuccess: () => {
      if (projectId) {
        refetchSavedQueries();
      }
    },
  });

  const addToHistory = (queryText: string, duration?: number) => {
    const entry = {
      id: Math.random().toString(36).substring(2, 9),
      query: queryText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      duration_ms: duration,
    };
    setHistory((prev) => {
      const next = [entry, ...prev.slice(0, 49)];
      localStorage.setItem(`insightflow_sql_history_${sessionId}`, JSON.stringify(next));
      return next;
    });
  };

  const handleRerun = (queryText: string) => {
    setSqlQuery(queryText);
    setTimeout(() => {
      handleRunSql(queryText);
    }, 50);
  };

  const queryMutation = useMutation({
    mutationFn: async (q: string) => {
      if (!sessionId) throw new Error("Please upload a dataset first.");
      q = q.trim();
      if (!q) throw new Error("Please enter a question.");
      return runQuery({ data: { session_id: sessionId, question: q } });
    },
    onSuccess: (res) => {
      setQueryResponse(res);
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    queryMutation.mutate(question);
  };

  const handleRunSql = async (overrideQuery?: string) => {
    if (!sessionId) return;
    const queryToRun = typeof overrideQuery === "string" ? overrideQuery : sqlQuery;
    setSqlError(null);
    setSqlRunning(true);
    try {
      const res = await runSqlQuery({ data: { session_id: sessionId, query: queryToRun } });
      setSqlResult(res);
      addToHistory(queryToRun, res.execution_time_ms);
    } catch (err: any) {
      setSqlError(err.message || "Query failed");
      setSqlResult(null);
      addToHistory(queryToRun);
    } finally {
      setSqlRunning(false);
    }
  };

  const handleExportSQLQuery = async (format: "csv" | "xlsx") => {
    if (!sqlResult || !sqlResult.rows.length) {
      toast.error("No query results to export.");
      return;
    }

    try {
      const fileName = `insightflow_query_result_${sessionId}.${format}`;
      if (format === "csv") {
        const Papa = (await import("papaparse")).default;
        const csv = Papa.unparse(sqlResult.rows);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        toast.success("Query results downloaded as CSV successfully!");
      } else {
        const { downloadXLSX } = await import("@/lib/exportUtils");
        downloadXLSX(sqlResult.rows, fileName, "Query Results");
        toast.success("Query results downloaded as Excel successfully!");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(`Failed to export query results: ${err.message || "Unknown error"}`);
    }
  };

  const handleExportNLQuery = async (format: "csv" | "xlsx") => {
    if (!queryResponse || !queryResponse.result) {
      toast.error("No query results to export.");
      return;
    }

    const { type, data } = queryResponse.result;
    if (type !== "dataframe" && type !== "series") {
      toast.error("Only DataFrame or Series results can be exported.");
      return;
    }

    try {
      const fileName = `insightflow_query_result_${sessionId}.${format}`;
      let exportRows: any[] = [];
      if (type === "dataframe") {
        exportRows = data;
      } else if (type === "series") {
        exportRows = Object.entries(data).map(([key, val]) => ({
          Index: key,
          Value: val
        }));
      }

      if (format === "csv") {
        const Papa = (await import("papaparse")).default;
        const csv = Papa.unparse(exportRows);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        toast.success("Query results downloaded as CSV successfully!");
      } else {
        const { downloadXLSX } = await import("@/lib/exportUtils");
        downloadXLSX(exportRows, fileName, "Query Results");
        toast.success("Query results downloaded as Excel successfully!");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(`Failed to export query results: ${err.message || "Unknown error"}`);
    }
  };

  const runSuggestion = (suggestedQuestion: string) => {
    setQuestion(suggestedQuestion);
    queryMutation.mutate(suggestedQuestion);
  };

  const suggestions = [
    "how many employees are in engineering",
    "median salary by department",
    "average salary",
    "highest salary",
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
    <>
      <Card className="w-full border border-border/80 bg-card/60 backdrop-blur-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Terminal className="h-5 w-5 text-primary" />
          {queryMode === "nl" ? "AI Code Sandbox (NL Query)" : "DuckDB SQL Query Console"}
        </CardTitle>
        <CardDescription>
          {queryMode === "nl"
            ? "Ask questions using natural language. The engine converts your prompt to pandas code using Groq and executes it."
            : "Run real, read-only SELECT queries directly against your uploaded dataset."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Toggle Mode */}
        <div className="flex gap-2 p-1 rounded-lg bg-secondary/35 border border-border/60 w-fit">
          <button
            type="button"
            onClick={() => setQueryMode("nl")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold font-mono tracking-wide transition-all ${
              queryMode === "nl"
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:text-white"
            }`}
          >
            Natural Language
          </button>
          <button
            type="button"
            onClick={() => setQueryMode("sql")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold font-mono tracking-wide transition-all ${
              queryMode === "sql"
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:text-white"
            }`}
          >
            SQL Mode
          </button>
        </div>

        {queryMode === "nl" ? (
          <div className="space-y-6">
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
                  className="pr-10 bg-background/50 border-border"
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

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      Execution Output
                    </h4>
                    {queryResponse.result && (queryResponse.result.type === "dataframe" || queryResponse.result.type === "series") && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleExportNLQuery("csv")}
                          className="flex items-center gap-1 text-[10px] text-primary hover:underline cursor-pointer"
                        >
                          <Download className="h-3 w-3" /> CSV
                        </button>
                        <button
                          onClick={() => handleExportNLQuery("xlsx")}
                          className="flex items-center gap-1 text-[10px] text-emerald-500 hover:underline cursor-pointer"
                        >
                          <Download className="h-3 w-3" /> Excel
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="p-1 rounded-lg border border-border/80 bg-muted/10">
                    {renderResult(queryResponse.result)}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-4 items-stretch min-h-[220px]">
              
              {/* Collapsible Sidebar: Schema & Queries Browser */}
              {isSchemaOpen && (
                <div className="w-64 border border-border bg-background/40 rounded-lg flex flex-col overflow-hidden text-left animate-in slide-in-from-left duration-250">
                  <div className="border-b border-border bg-muted/30">
                    <div className="px-3 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-foreground">
                        <Database className="h-3.5 w-3.5 text-primary" />
                        <span>SQL Browser</span>
                      </div>
                      <button
                        onClick={() => setIsSchemaOpen(false)}
                        className="text-muted-foreground hover:text-foreground cursor-pointer p-0.5 rounded hover:bg-muted"
                        title="Collapse Sidebar"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    {/* Tabs */}
                    <div className="flex border-t border-border/40 text-[10px] font-bold text-muted-foreground">
                      <button
                        onClick={() => setActiveSidebarTab("schema")}
                        className={`flex-1 py-1.5 text-center border-b-2 transition-all cursor-pointer ${
                          activeSidebarTab === "schema"
                            ? "border-primary text-primary bg-background/20"
                            : "border-transparent hover:text-foreground hover:bg-muted/10"
                        }`}
                      >
                        Table Schema
                      </button>
                      <button
                        onClick={() => setActiveSidebarTab("queries")}
                        className={`flex-1 py-1.5 text-center border-b-2 transition-all cursor-pointer ${
                          activeSidebarTab === "queries"
                            ? "border-primary text-primary bg-background/20"
                            : "border-transparent hover:text-foreground hover:bg-muted/10"
                        }`}
                      >
                        Queries ({savedQueriesList.length + history.length})
                      </button>
                    </div>
                  </div>

                  {activeSidebarTab === "schema" ? (
                    <div className="flex-1 overflow-y-auto p-2 space-y-1 max-h-[260px] select-none">
                      <div className="px-2 py-1 text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                        Table: dataset
                      </div>
                      {profile?.columns.map((c) => (
                        <button
                          key={c.name}
                          onClick={() => handleInsertColumn(c.name)}
                          className="w-full text-left px-2 py-1.5 rounded text-[10px] font-mono flex items-center justify-between hover:bg-secondary/40 transition-colors cursor-pointer group"
                          title="Click to insert at cursor"
                        >
                          <span className="truncate text-foreground group-hover:text-primary transition-colors font-medium">
                            {c.name}
                          </span>
                          <span className="text-[8px] text-muted-foreground bg-secondary/80 px-1 py-0.5 rounded font-sans uppercase font-semibold shrink-0">
                            {c.type === "numeric" ? "num" : c.type === "categorical" ? "cat" : c.type}
                          </span>
                        </button>
                      ))}
                      {(!profile || profile.columns.length === 0) && (
                        <div className="text-[10px] text-muted-foreground italic p-2 text-center">
                          No columns available
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col overflow-hidden max-h-[260px]">
                      {/* Sub-tabs */}
                      <div className="flex border-b border-border/40 text-[9px] font-bold text-muted-foreground bg-muted/10">
                        <button
                          onClick={() => setActiveQueriesTab("history")}
                          className={`flex-1 py-1 text-center transition-all cursor-pointer ${
                            activeQueriesTab === "history"
                              ? "text-foreground bg-background/40 animate-in fade-in"
                              : "hover:text-foreground hover:bg-muted/5"
                          }`}
                        >
                          History ({history.length})
                        </button>
                        <button
                          onClick={() => setActiveQueriesTab("saved")}
                          className={`flex-1 py-1 text-center transition-all cursor-pointer ${
                            activeQueriesTab === "saved"
                              ? "text-foreground bg-background/40 animate-in fade-in"
                              : "hover:text-foreground hover:bg-muted/5"
                          }`}
                        >
                          Saved ({savedQueriesList.length})
                        </button>
                      </div>

                      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                        {activeQueriesTab === "history" ? (
                          <>
                            {history.map((h) => (
                              <div key={h.id} className="p-2 rounded bg-secondary/20 border border-border/30 hover:border-border/60 transition-colors space-y-1.5 text-left group">
                                <div className="flex items-center justify-between text-[8px] text-muted-foreground font-mono">
                                  <span>{h.timestamp}</span>
                                  {h.duration_ms !== undefined && (
                                    <span className="text-emerald-400 font-semibold">{h.duration_ms.toFixed(1)}ms</span>
                                  )}
                                </div>
                                <pre className="text-[9px] font-mono text-slate-300 max-h-12 overflow-hidden overflow-x-auto whitespace-pre-wrap select-all leading-normal">
                                  {h.query}
                                </pre>
                                <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => handleRerun(h.query)}
                                    className="px-1.5 py-0.5 bg-primary/20 hover:bg-primary/40 text-primary-foreground text-[8px] rounded font-bold cursor-pointer transition-colors"
                                  >
                                    Rerun
                                  </button>
                                </div>
                              </div>
                            ))}
                            {history.length === 0 && (
                              <div className="text-[10px] text-muted-foreground italic p-4 text-center">
                                No executed queries yet
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            {savedQueriesList.map((q) => (
                              <div key={q.id} className="p-2 rounded bg-secondary/25 border border-primary/10 hover:border-primary/30 transition-colors space-y-1 text-left group relative">
                                <div className="font-bold text-[10px] text-foreground truncate pr-6">
                                  {q.name}
                                </div>
                                <pre className="text-[9px] font-mono text-slate-400 max-h-10 overflow-hidden overflow-x-auto whitespace-pre-wrap leading-normal select-all">
                                  {q.query_text}
                                </pre>
                                <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => handleRerun(q.query_text)}
                                    className="px-1.5 py-0.5 bg-primary/20 hover:bg-primary/40 text-primary-foreground text-[8px] rounded font-bold cursor-pointer transition-colors"
                                  >
                                    Load & Run
                                  </button>
                                  <button
                                    onClick={() => deleteQueryMutation.mutate(q.id)}
                                    className="text-red-400 hover:text-red-300 p-0.5 cursor-pointer rounded"
                                    title="Delete query"
                                    disabled={deleteQueryMutation.isPending}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            ))}
                            {savedQueriesList.length === 0 && (
                              <div className="text-[10px] text-muted-foreground italic p-4 text-center">
                                No saved queries
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* SQL Editor Area */}
              <div className="flex-1 flex flex-col space-y-3 text-left min-w-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {!isSchemaOpen && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsSchemaOpen(true)}
                        className="h-8 text-[10px] font-bold bg-background/50 border-border hover:bg-muted"
                      >
                        <Database className="h-3.5 w-3.5 mr-1" />
                        Show SQL Browser
                      </Button>
                    )}
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Database className="h-3.5 w-3.5 text-primary" />
                      Table: <code>dataset</code>
                    </span>
                  </div>
                </div>

                <div className="rounded-lg overflow-hidden border border-border bg-background/30 text-foreground text-sm focus-within:ring-1 focus-within:ring-primary focus-within:border-primary">
                  <CodeMirror
                    value={sqlQuery}
                    height="140px"
                    theme="dark"
                    extensions={[
                      sqlExtension,
                      sqlExtension.language.data.of({
                        autocomplete: customCompletionSource,
                      }),
                    ]}
                    onCreateEditor={(view) => {
                      editorViewRef.current = view;
                    }}
                    onChange={(val) => setSqlQuery(val)}
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <Button onClick={() => handleRunSql()} disabled={sqlRunning || !sqlQuery.trim()}>
                      {sqlRunning ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent mr-1" />
                      ) : (
                        <Play className="h-4 w-4 mr-1" />
                      )}
                      Run Query
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setIsSaveModalOpen(true)}
                      disabled={sqlRunning || !sqlQuery.trim()}
                      className="cursor-pointer border-border hover:bg-muted"
                    >
                      Save Query
                    </Button>
                  </div>
                  {!projectId && (
                    <span className="text-[10px] text-amber-500/80 bg-amber-500/5 px-2 py-1 rounded border border-amber-500/10 font-mono">
                      Unsaved Project: Saving to LocalStorage
                    </span>
                  )}
                </div>
              </div>
            </div>

            {sqlError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>SQL Execution Failed</AlertTitle>
                <AlertDescription>{sqlError}</AlertDescription>
              </Alert>
            )}

            {sqlResult && (
              <div className="space-y-3 mt-4 pt-4 border-t border-border text-left">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-3">
                    <span className="font-mono">Returned {sqlResult.rows.length} rows</span>
                    {sqlResult.rows.length > 0 && (
                      <div className="flex items-center gap-2 border-l border-border pl-3">
                        <button
                          onClick={() => handleExportSQLQuery("csv")}
                          className="flex items-center gap-1 text-[10px] text-primary hover:underline cursor-pointer"
                        >
                          <Download className="h-3 w-3" /> CSV
                        </button>
                        <button
                          onClick={() => handleExportSQLQuery("xlsx")}
                          className="flex items-center gap-1 text-[10px] text-emerald-500 hover:underline cursor-pointer"
                        >
                          <Download className="h-3 w-3" /> Excel
                        </button>
                      </div>
                    )}
                  </div>
                  {sqlResult.execution_time_ms !== undefined && (
                    <span className="font-mono text-emerald-400">Execution: {sqlResult.execution_time_ms.toFixed(1)} ms</span>
                  )}
                </div>
                <div className="overflow-x-auto rounded border border-border/80 bg-background/50 max-h-[300px]">
                  <Table>
                    <TableHeader className="bg-muted/50 sticky top-0 z-10">
                      <TableRow>
                        {sqlResult.columns.map((c) => (
                          <TableHead key={c} className="font-mono text-xs font-semibold">
                            {c}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sqlResult.rows.map((row, i) => (
                        <TableRow key={i} className="hover:bg-muted/20">
                          {sqlResult.columns.map((c) => (
                            <TableCell key={c} className="font-mono text-xs max-w-[200px] truncate">
                              {row[c] === null || row[c] === undefined ? (
                                <span className="text-muted-foreground italic">null</span>
                              ) : (
                                String(row[c])
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {sqlResult.truncated && (
                  <p className="text-xs text-amber-400 mt-2 font-mono flex items-center gap-1">
                    <ShieldAlert className="h-3.5 w-3.5 text-amber-400" /> Showing first 1000 rows of {sqlResult.row_count}.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>

    {/* Save Query Dialog Modal */}
    {isSaveModalOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-250">
        <div className="bg-popover border border-border rounded-xl shadow-lg max-w-sm w-full p-6 space-y-4 relative text-left">
          <button
            onClick={() => setIsSaveModalOpen(false)}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
          <h3 className="text-base font-bold text-foreground">Save SQL Query</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Name this SQL query to store it in your browser or project registry.
          </p>
          
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Query Name</label>
            <Input
              placeholder="e.g. Average Salary by Dep"
              value={saveQueryName}
              onChange={(e) => setSaveQueryName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveQueryName.trim() && saveQueryMutation.mutate(saveQueryName)}
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" className="cursor-pointer text-xs h-9" onClick={() => setIsSaveModalOpen(false)}>
              Cancel
            </Button>
            <Button
              className="cursor-pointer text-xs h-9 font-semibold"
              onClick={() => saveQueryMutation.mutate(saveQueryName)}
              disabled={saveQueryMutation.isPending || !saveQueryName.trim()}
            >
              {saveQueryMutation.isPending ? "Saving..." : "Save Query"}
            </Button>
          </div>
        </div>
      </div>
    )}
  </>
);
};
