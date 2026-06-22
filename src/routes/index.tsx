import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import {
  Activity, AlertTriangle, BarChart3, Brain, Database, Download, FileWarning,
  Lightbulb, ListChecks, MessageSquare, Sparkles, Wand2, GitCompareArrows,
  LayoutDashboard, ShieldCheck, ShieldAlert, ShieldX, ChevronLeft, ChevronRight,
  Zap, Eye, Target, TrendingUp, Zap as ZapIcon,
} from "lucide-react";
import { FileDrop } from "@/components/FileDrop";
import { MetricCard } from "@/components/MetricCard";
import { TrustGauge } from "@/components/TrustGauge";
import { AutoCharts } from "@/components/AutoCharts";
import { ChatPanel } from "@/components/ChatPanel";
import { MiniBarChart } from "@/components/MiniBarChart";
import { ModelingPanel } from "@/components/ModelingPanel";
import { parseFile } from "@/lib/parseFile";
import { profileDataset, generateInsights, trendForecast, type DatasetProfile } from "@/lib/profiler";
import { computeRiskLevel, severityFor, severityStyle } from "@/lib/riskLevel";
import { exportReportPDF } from "@/lib/exportReport";
import { askDataset } from "@/utils/ai.functions";
import { cn } from "@/lib/utils";
import { startAnalysis, getAnalysisStatus, type AnalysisResult } from "@/server/analysis";
import { DependencyHeatmaps } from "@/components/DependencyHeatmaps";
import { AnomalyPanel } from "@/components/AnomalyPanel";
import { QueryBox } from "@/components/QueryBox";

export const Route = createFileRoute("/")(  {
  head: () => ({
    meta: [
      { title: "InsightFlow — Analyst Console" },
      { name: "description", content: "Upload a CSV or Excel file and get an analyst-grade intelligence report: dashboard, trust score, risks, insights, and an Ask-Your-Data chat." },
      { property: "og:title", content: "InsightFlow" },
      { property: "og:description", content: "Turn raw datasets into decision intelligence — dashboard, trust score, risks, contradictions, insights, and chat." },
    ],
  }),
  component: Home,
});

type Persona = "business" | "student" | "developer";
type Tab = "dashboard" | "overview" | "charts" | "insights" | "trust" | "chat" | "modeling" | "report" | "anomaly";

function Home() {
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<DatasetProfile | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [fileName, setFileName] = useState("");
  const [tab, setTab] = useState<Tab>("dashboard");
  const [persona, setPersona] = useState<Persona>("business");
  const [narrative, setNarrative] = useState<string>("");
  const [story, setStory] = useState<string>("");
  const [aiBusy, setAiBusy] = useState<"narrative" | "story" | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const ask = useServerFn(askDataset);
  const runStartAnalysis = useServerFn(startAnalysis);
  const runGetAnalysisStatus = useServerFn(getAnalysisStatus);

  const insights = useMemo(() => (profile ? generateInsights(profile) : []), [profile]);
  const forecast = useMemo(() => (profile ? trendForecast(profile) : null), [profile]);
  const risk = useMemo(() => (profile ? computeRiskLevel(profile) : null), [profile]);

  const handleFile = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["csv", "tsv", "txt", "xlsx", "xls"].includes(ext ?? "")) {
      toast.error("Unsupported file. Please upload .csv, .tsv, .xlsx, or .xls.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error("File is larger than 25 MB — try a smaller sample.");
      return;
    }
    setBusy(true);
    try {
      const parsed = await parseFile(file);
      if (!parsed.rows.length) { toast.error("File has no rows."); return; }
      const p = profileDataset(parsed.rows, parsed.headers);
      setProfile(p); setRows(parsed.rows); setFileName(parsed.fileName); setTab("dashboard");
      setNarrative(""); setStory("");
      toast.success(`Profiled ${parsed.rows.length.toLocaleString()} rows × ${parsed.headers.length} columns`);

      // Backend Background analysis job
      setAnalyzing(true);
      setAnalysis(null);
      const session_id = `session_${Date.now()}`;
      setSessionId(session_id);
      
      const dataDict: Record<string, unknown[]> = {};
      parsed.headers.forEach(h => {
        dataDict[h] = parsed.rows.map(r => r[h]);
      });
      
      await runStartAnalysis({ session_id, data: dataDict });
      
      let completed = false;
      let attempts = 0;
      while (!completed && attempts < 60) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const statusRes = await runGetAnalysisStatus({ session_id });
        if (statusRes.status === "completed" && statusRes.result) {
          setAnalysis(statusRes.result);
          completed = true;
          toast.success("Backend intelligence profile complete!");
        } else if (statusRes.status === "failed") {
          throw new Error(statusRes.error || "Backend analysis failed");
        }
        attempts++;
      }
      if (!completed) {
        toast.error("Backend analysis timed out. Using client fallback.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to parse file");
    } finally { 
      setBusy(false); 
      setAnalyzing(false);
    }
  };

  const runAi = async (mode: "narrative" | "story") => {
    if (!profile) return;
    setAiBusy(mode);
    try {
      const slim = { ...profile, preview: profile.preview.slice(0, 3) };
      const res = await ask({ data: { profile: slim, question: "", persona, mode } });
      if (res.error) toast.error(res.error);
      else if (mode === "narrative") setNarrative(res.content || "");
      else setStory(res.content || "");
    } finally { setAiBusy(null); }
  };

  const tabs: { id: Tab; label: string; icon: typeof Database; desc: string }[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, desc: "Overview" },
    { id: "overview", label: "Profiling", icon: Database, desc: "Column analysis" },
    { id: "charts", label: "Visualizations", icon: BarChart3, desc: "Auto-charts" },
    { id: "insights", label: "Insights", icon: Lightbulb, desc: "Key findings" },
    { id: "trust", label: "Trust & Risk", icon: AlertTriangle, desc: "Quality score" },
    { id: "modeling", label: "ML Models", icon: ZapIcon, desc: "Train & evaluate" },
    { id: "anomaly", label: "Anomalies", icon: ShieldAlert, desc: "Outlier detection" },
    { id: "chat", label: "Ask your data", icon: MessageSquare, desc: "AI chat" },
    { id: "report", label: "Report", icon: Download, desc: "Export PDF" },
  ];

  // Landing (no dataset) — full-width hero
  if (!profile) {
    return (
      <div className="min-h-screen">
        <TopBar persona={persona} setPersona={setPersona} hidePersona />
        <main className="mx-auto max-w-7xl px-6 py-8">
          <section className="relative">
            <div className="absolute inset-0 -z-10 bg-grid opacity-20 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
            <div className="mx-auto max-w-3xl py-12 text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-primary">
                <Sparkles className="h-3.5 w-3.5 animate-pulse-glow text-primary" /> analyst-grade · explainable · local-first
              </div>
              <h2 className="mt-6 text-4xl font-bold tracking-tight md:text-6xl">
                Turn raw data into{" "}
                <span className="text-gradient">decisions</span>.
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Drop a CSV or Excel file. Get a trust score, behavior narrative, automated visualizations
                with reasoning, risks, contradictions, suggested questions, and a chat that knows your data.
              </p>
            </div>
            <div className="mx-auto max-w-2xl">
              <FileDrop onFile={handleFile} busy={busy} />
            </div>
            <div className="mx-auto mt-12 grid max-w-4xl gap-4 md:grid-cols-3">
              {[
                { i: Activity, t: "Profiling Engine", d: "Types, missingness, duplicates, outliers, cardinality — all computed instantly in the browser.", accent: "primary" },
                { i: AlertTriangle, t: "Trust & Risk", d: "Weighted trust score with contradictions and human-error signals. Know your data quality at a glance.", accent: "warning" },
                { i: Wand2, t: "AI Reasoning", d: "Behavior narrative, persona-aware insights, data story, and a chat that truly understands your dataset.", accent: "accent" },
              ].map(({ i: Icon, t, d, accent }) => (
                <div key={t} className="surface-card group relative overflow-hidden p-5 transition-all duration-300 hover:neon-border hover:scale-[1.02]">
                  <div className="absolute inset-0 bg-gradient-to-br from-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style={{ background: `linear-gradient(135deg, color-mix(in oklab, var(--color-${accent}) 5%, transparent), transparent)` }} />
                  <div className="relative">
                    <div className={cn("inline-flex h-10 w-10 items-center justify-center rounded-lg",
                      accent === "primary" && "bg-primary/10",
                      accent === "warning" && "bg-[color:var(--color-warning)]/10",
                      accent === "accent" && "bg-accent/10",
                    )}>
                      <Icon className={cn("h-5 w-5",
                        accent === "primary" && "text-primary",
                        accent === "warning" && "text-[color:var(--color-warning)]",
                        accent === "accent" && "text-accent",
                      )} />
                    </div>
                    <div className="mt-3 text-sm font-semibold">{t}</div>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{d}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    );
  }

  // App with dataset — sidebar layout
  return (
    <div className="min-h-screen">
      <TopBar persona={persona} setPersona={setPersona} />
      <div className="flex">
        {/* Sidebar */}
        <aside className={cn(
          "glass-sidebar sticky top-[57px] hidden h-[calc(100vh-57px)] shrink-0 flex-col p-3 transition-all duration-300 md:flex",
          sidebarCollapsed ? "w-16" : "w-56",
        )}>
          {/* Dataset info */}
          {!sidebarCollapsed && (
            <div className="mb-4 px-2">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">active dataset</div>
              <div className="mt-0.5 truncate text-sm font-semibold" title={fileName}>{fileName}</div>
              {risk && (
                <div className="mt-1.5">
                  <RiskBadge level={risk.level} />
                </div>
              )}
            </div>
          )}

          {/* Nav items */}
          <nav className="flex flex-1 flex-col gap-0.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                title={sidebarCollapsed ? t.label : undefined}
                className={cn(
                  "group flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-all duration-200",
                  tab === t.id
                    ? "bg-gradient-to-r from-primary/15 to-accent/10 text-foreground shadow-[inset_0_0_0_1px_var(--color-primary)] glow-sm"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                  sidebarCollapsed && "justify-center px-0",
                )}
              >
                <t.icon className={cn("h-4 w-4 shrink-0 transition-colors", tab === t.id && "text-primary")} />
                {!sidebarCollapsed && (
                  <div className="flex-1 min-w-0">
                    <div>{t.label}</div>
                    <div className="text-[10px] text-muted-foreground font-normal">{t.desc}</div>
                  </div>
                )}
              </button>
            ))}
          </nav>

          {/* Sidebar footer */}
          <div className="mt-auto space-y-2">
            <button
              onClick={() => { setProfile(null); setRows([]); setFileName(""); setTab("dashboard"); }}
              className={cn(
                "w-full rounded-lg border border-border bg-secondary/40 text-xs transition-all duration-200 hover:border-primary hover:bg-primary/5",
                sidebarCollapsed ? "p-2.5 flex justify-center" : "px-3 py-2",
              )}
            >
              {sidebarCollapsed ? <Database className="h-4 w-4" /> : "Upload new dataset"}
            </button>
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="flex w-full items-center justify-center rounded-lg border border-border bg-secondary/20 p-1.5 text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
            >
              {sidebarCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
          {/* Mobile tab strip */}
          <nav className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-border bg-card/40 p-1.5 md:hidden">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-200",
                  tab === t.id ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:bg-secondary",
                )}
              >
                <t.icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            ))}
          </nav>

          <div key={tab} className="animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
            {tab === "dashboard" && profile && risk && (
              <div className="space-y-6">
                {analyzing && (
                  <div className="surface-card p-6 flex flex-col items-center justify-center space-y-4">
                    <span className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    <p className="text-sm font-medium text-muted-foreground">Running backend intelligence profiling...</p>
                  </div>
                )}
                
                {analysis ? (
                  <div className="space-y-6">
                    {/* Backend Shape, Trust Score, & Breakdown */}
                    <div className="grid gap-6 lg:grid-cols-3">
                      {/* Shape and Info */}
                      <div className="surface-card p-5 flex flex-col justify-between">
                        <div>
                          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">dataset shape</div>
                          <div className="mt-2 text-2xl font-bold text-gradient">{analysis.shape.rows.toLocaleString()} rows</div>
                          <div className="text-lg font-semibold text-muted-foreground">{analysis.shape.cols} columns</div>
                          <div className="mt-1 text-xs text-muted-foreground">{analysis.shape.total_cells.toLocaleString()} total cells</div>
                        </div>
                        <div className="mt-4 border-t border-border/40 pt-4 flex gap-4">
                          <div>
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">risk level</span>
                            <div className="mt-1"><RiskBadge level={risk.level} /></div>
                          </div>
                        </div>
                      </div>

                      {/* Trust Score Breakdown */}
                      <div className="surface-card p-5 lg:col-span-2 flex flex-col md:flex-row gap-6">
                        <div className="flex flex-col items-center justify-center shrink-0 w-full md:w-48 border-b md:border-b-0 md:border-r border-border/40 pb-6 md:pb-0 md:pr-6">
                          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">trust score</span>
                          <div className="mt-3 text-6xl font-extrabold animate-pulse-glow" style={{ color: analysis.trust_score >= 80 ? "var(--color-success)" : analysis.trust_score >= 55 ? "var(--color-warning)" : "var(--color-destructive)" }}>
                            {analysis.trust_score}
                          </div>
                          <span className="mt-2 text-xs text-muted-foreground text-center">Composite quality metric</span>
                        </div>
                        <div className="flex-1 space-y-3.5">
                          {analysis.trust_breakdown.map((b) => (
                            <div key={b.label} className="text-xs">
                              <div className="flex justify-between font-medium mb-1">
                                <span>{b.label}</span>
                                <span className="text-muted-foreground font-mono">{b.score.toFixed(0)}%</span>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                                <div className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500" style={{ width: `${b.score}%` }} />
                              </div>
                              <div className="mt-0.5 text-[10px] text-muted-foreground">{b.note}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Column Profile Table */}
                    <BackendColumnTable columns={analysis.columns} />

                    {/* Dependency Heatmaps */}
                    <DependencyHeatmaps
                      columns={analysis.dependency.columns}
                      pearson={analysis.dependency.pearson}
                      spearman={analysis.dependency.spearman}
                      mutual_info={analysis.dependency.mutual_info}
                    />
                  </div>
                ) : (
                  <Dashboard profile={profile} risk={risk} insights={insights} fileName={fileName} onJump={setTab} />
                )}
              </div>
            )}
            {tab === "overview" && <Profiling profile={profile} forecast={forecast} narrative={narrative} runNarrative={() => runAi("narrative")} aiBusy={aiBusy === "narrative"} />}
            {tab === "charts" && <AutoCharts profile={profile} rows={rows} />}
            {tab === "insights" && <Insights insights={insights} profile={profile} />}
            {tab === "trust" && <TrustRisk profile={profile} />}
            {tab === "modeling" && <ModelingPanel data={rows} columns={profile?.columns.map(c => c.name) || []} />}
            {tab === "anomaly" && <AnomalyPanel sessionId={sessionId} />}
            {tab === "chat" && (
              <div className="grid gap-6 md:grid-cols-2 items-start">
                <QueryBox sessionId={sessionId} />
                <ChatPanel profile={profile} persona={persona} suggestions={profile.suggestedQuestions} />
              </div>
            )}
            {tab === "report" && (
              <ReportTab
                profile={profile}
                fileName={fileName}
                insights={insights}
                narrative={narrative}
                story={story}
                runStory={() => runAi("story")}
                aiBusy={aiBusy === "story"}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

/* ─── TopBar ─── */
function TopBar({ persona, setPersona, hidePersona }: { persona: Persona; setPersona: (p: Persona) => void; hidePersona?: boolean }) {
  return (
    <header className="glass-topbar sticky top-0 z-20">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent shadow-[0_0_24px_-4px_var(--color-primary)]">
            <Brain className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-tight">
              Insight<span className="text-gradient">Flow</span>
            </h1>
            <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Upload → Profile → Decide</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!hidePersona && (
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline font-mono text-[10px] uppercase tracking-wider text-muted-foreground">persona</span>
              <select
                value={persona}
                onChange={(e) => setPersona(e.target.value as Persona)}
                className="rounded-lg border border-input bg-background/60 px-2.5 py-1.5 text-xs backdrop-blur-sm transition-colors focus:border-primary focus:outline-none"
              >
                <option value="business">Business</option>
                <option value="student">Student</option>
                <option value="developer">Developer</option>
              </select>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/* ─── Risk Badge ─── */
function RiskBadge({ level }: { level: "low" | "medium" | "high" }) {
  const cfg = {
    low: { Icon: ShieldCheck, color: "var(--color-success)", label: "LOW RISK", bg: "bg-[color:var(--color-success)]/10" },
    medium: { Icon: ShieldAlert, color: "var(--color-warning)", label: "MEDIUM RISK", bg: "bg-[color:var(--color-warning)]/10" },
    high: { Icon: ShieldX, color: "var(--color-destructive)", label: "HIGH RISK", bg: "bg-destructive/10" },
  }[level];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider"
      style={{ background: `color-mix(in oklab, ${cfg.color} 15%, transparent)`, color: cfg.color }}
    >
      <cfg.Icon className="h-3 w-3" /> {cfg.label}
    </span>
  );
}

/* ─── Dashboard ─── */
function Dashboard({
  profile, risk, insights, fileName, onJump,
}: {
  profile: DatasetProfile;
  risk: { level: "low" | "medium" | "high"; reasons: string[] };
  insights: { text: string; why?: string; confidence: number; tag: string }[];
  fileName: string;
  onJump: (t: Tab) => void;
}) {
  const trustColor = profile.trustScore >= 80 ? "var(--color-success)" : profile.trustScore >= 55 ? "var(--color-warning)" : "var(--color-destructive)";
  const firstCat = profile.columns.find((c) => c.type === "categorical" && c.topValues?.length);
  const miniData = firstCat?.topValues?.slice(0, 5).map((t) => ({ value: String(t.value).slice(0, 12), count: t.count })) ?? [];

  return (
    <div className="space-y-6">
      {/* Header strip */}
      <div className="surface-card relative overflow-hidden p-6">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-accent/5" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">active dataset</div>
            <div className="mt-1 flex items-center gap-3">
              <div className="truncate text-xl font-bold" title={fileName}>{fileName}</div>
              <RiskBadge level={risk.level} />
            </div>
            {risk.reasons.length > 0 && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                <span className="text-foreground/70 font-medium">Risk drivers:</span> {risk.reasons.join(" · ")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">trust score</div>
              <div className="text-4xl font-bold tabular-nums animate-pulse-glow" style={{ color: trustColor }}>{profile.trustScore}</div>
            </div>
            <div className="h-12 w-px bg-border/50" />
            <button
              onClick={() => onJump("report")}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-accent px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_0_30px_-6px_var(--color-primary)] transition-all duration-200 hover:opacity-90 hover:scale-105 active:scale-95"
            >
              <Download className="h-4 w-4" /> Export Report
            </button>
          </div>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Rows" value={profile.rowCount.toLocaleString()} icon={Database} accent="primary" />
        <MetricCard label="Columns" value={profile.colCount} icon={BarChart3} accent="primary" />
        <MetricCard
          label="Missing cells"
          value={`${profile.missingPct.toFixed(1)}%`}
          hint={`${profile.missingCells.toLocaleString()} total cells missing`}
          icon={Eye}
          accent={profile.missingPct > 10 ? "warning" : "success"}
        />
        <MetricCard
          label="Duplicate rows"
          value={profile.duplicateRows.toLocaleString()}
          hint={profile.duplicateRows > 0 ? "May affect analysis accuracy" : "Clean — no duplicates found"}
          icon={Target}
          accent={profile.duplicateRows ? "warning" : "success"}
        />
      </div>

      {/* Highlights */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="surface-card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
                <Lightbulb className="h-4 w-4 text-primary" />
              </div>
              Top insights
            </h3>
            <button onClick={() => onJump("insights")} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground transition-colors hover:border-primary hover:text-primary">
              view all <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <ul className="space-y-3">
            {insights.slice(0, 3).map((i, idx) => (
              <li key={idx} className="rounded-lg border border-border/60 bg-background/30 p-3.5 transition-all duration-200 hover:border-primary/30 hover:bg-primary/[0.02]">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 rounded-md bg-primary/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary">{i.tag}</span>
                  <div className="flex-1 text-sm">
                    <ReactMarkdown components={{ p: ({ children }) => <span>{children}</span> }}>{i.text}</ReactMarkdown>
                    {i.why && (
                      <div className="mt-2 rounded-md bg-background/40 px-2.5 py-1.5 text-xs text-muted-foreground">
                        <span className="font-semibold text-primary/80">Why this matters: </span>{i.why}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
            {!insights.length && <li className="text-sm text-muted-foreground">No insights generated yet.</li>}
          </ul>
        </div>

        <div className="surface-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/10">
                <BarChart3 className="h-4 w-4 text-accent" />
              </div>
              Quick chart
            </h3>
            <button onClick={() => onJump("charts")} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground transition-colors hover:border-primary hover:text-primary">
              all charts <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          {miniData.length ? (
            <>
              <div className="mb-2 text-xs text-muted-foreground">Top categories in <span className="font-mono text-foreground">{firstCat?.name}</span></div>
              <MiniBarChart data={miniData} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No categorical column suitable for a quick chart.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Profiling ─── */
function Profiling({
  profile, forecast, narrative, runNarrative, aiBusy,
}: { profile: DatasetProfile; forecast: string | null; narrative: string; runNarrative: () => void; aiBusy: boolean }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <TrustGauge score={profile.trustScore} />
        <div className="surface-card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              Behavior narrative
            </h3>
            <button
              onClick={runNarrative}
              disabled={aiBusy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-xs font-medium transition-all duration-200 hover:border-primary hover:bg-primary/5 disabled:opacity-40"
            >
              {aiBusy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />}
              {aiBusy ? "Thinking…" : narrative ? "Regenerate" : "Generate with AI"}
            </button>
          </div>
          {narrative ? (
            <div className="prose prose-sm prose-invert max-w-none">
              <ReactMarkdown>{narrative}</ReactMarkdown>
            </div>
          ) : (
            <ul className="space-y-2 text-sm text-muted-foreground">
              {profile.behavior.map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/60" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
          {forecast && (
            <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3.5 text-xs">
              <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-primary">
                <TrendingUp className="h-3 w-3" /> trend forecast
              </div>
              <div className="prose prose-sm prose-invert max-w-none">
                <ReactMarkdown>{forecast}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </div>

      <ColumnTable profile={profile} />
      <PreviewTable profile={profile} />
    </div>
  );
}

/* ─── Column Table ─── */
function ColumnTable({ profile }: { profile: DatasetProfile }) {
  return (
    <div className="surface-card overflow-hidden">
      <div className="border-b border-border/60 px-5 py-3.5 text-sm font-semibold flex items-center gap-2">
        <Database className="h-4 w-4 text-primary" /> Column profile
        <span className="ml-auto text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{profile.colCount} columns</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-secondary/30 text-muted-foreground">
            <tr>
              {["Column", "Type", "Missing %", "Unique", "Min", "Max", "Mean", "Notes"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left font-mono text-[10px] uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {profile.columns.map((c) => (
              <tr key={c.name} className="border-t border-border/40 transition-colors hover:bg-primary/[0.03]">
                <td className="px-3 py-2.5 font-medium">{c.name}</td>
                <td className="px-3 py-2.5"><TypePill type={c.type} /></td>
                <td className="px-3 py-2.5 tabular-nums">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-[color:var(--color-warning)] transition-all duration-500" style={{ width: `${Math.min(100, c.missingPct)}%` }} />
                    </div>
                    <span className={cn(c.missingPct > 20 && "text-[color:var(--color-warning)] font-semibold")}>{c.missingPct.toFixed(1)}%</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 tabular-nums">{c.unique}</td>
                <td className="px-3 py-2.5 tabular-nums">{c.min !== undefined ? c.min.toFixed(2) : "—"}</td>
                <td className="px-3 py-2.5 tabular-nums">{c.max !== undefined ? c.max.toFixed(2) : "—"}</td>
                <td className="px-3 py-2.5 tabular-nums">{c.mean !== undefined ? c.mean.toFixed(2) : "—"}</td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {c.constant && <span className="mr-1 rounded-md bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">constant</span>}
                  {c.highCardinality && <span className="mr-1 rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">high-card</span>}
                  {(c.outliers ?? 0) > 0 && <span className="mr-1 rounded-md bg-[color:var(--color-warning)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--color-warning)]">{c.outliers} outliers</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── TypePill ─── */
function TypePill({ type }: { type: string }) {
  const map: Record<string, string> = {
    numeric: "bg-primary/15 text-primary border-primary/20",
    categorical: "bg-accent/15 text-accent border-accent/20",
    datetime: "bg-[color:var(--color-info)]/15 text-[color:var(--color-info)] border-[color:var(--color-info)]/20",
    boolean: "bg-[color:var(--color-success)]/15 text-[color:var(--color-success)] border-[color:var(--color-success)]/20",
    text: "bg-secondary text-muted-foreground border-border",
    id: "bg-secondary text-muted-foreground border-border",
  };
  return <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-mono font-medium", map[type])}>{type}</span>;
}

/* ─── Preview Table ─── */
function PreviewTable({ profile }: { profile: DatasetProfile }) {
  return (
    <div className="surface-card overflow-hidden">
      <div className="border-b border-border/60 px-5 py-3.5 text-sm font-semibold flex items-center gap-2">
        <Eye className="h-4 w-4 text-primary" /> Preview
        <span className="ml-auto text-[10px] font-mono text-muted-foreground uppercase tracking-wider">first {profile.preview.length} rows</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-secondary/30 text-muted-foreground">
            <tr>
              {profile.headers.map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2.5 text-left font-mono text-[10px] uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {profile.preview.map((r, i) => (
              <tr key={i} className="border-t border-border/40 transition-colors hover:bg-primary/[0.02]">
                {profile.headers.map((h) => (
                  <td key={h} className="whitespace-nowrap px-3 py-2">{String(r[h] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Insights ─── */
function Insights({
  insights, profile,
}: { insights: { text: string; why?: string; confidence: number; tag: string }[]; profile: DatasetProfile }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="surface-card p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
            <Lightbulb className="h-4 w-4 text-primary" />
          </div>
          Key findings
        </h3>
        <ul className="space-y-3">
          {insights.map((i, idx) => (
            <li key={idx} className="group rounded-lg border border-border/60 bg-background/30 p-3.5 transition-all duration-200 hover:border-primary/30 hover:bg-primary/[0.02]">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 min-w-[3rem] items-center justify-center rounded-md bg-primary/10 font-mono text-[10px] font-semibold text-primary">
                  {(i.confidence * 100).toFixed(0)}%
                </div>
                <div className="flex-1">
                  <span className="mr-2 rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{i.tag}</span>
                  <span className="text-sm">
                    <ReactMarkdown components={{ p: ({ children }) => <span>{children}</span> }}>
                      {i.text}
                    </ReactMarkdown>
                  </span>
                  {i.why && (
                    <div className="mt-2 rounded-md bg-background/40 px-2.5 py-1.5 text-xs text-muted-foreground">
                      <span className="font-semibold text-primary/80">Why this matters: </span>{i.why}
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="surface-card p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/10">
            <MessageSquare className="h-4 w-4 text-accent" />
          </div>
          Suggested questions
        </h3>
        <ul className="space-y-2">
          {profile.suggestedQuestions.map((q) => (
            <li key={q} className="group flex items-center gap-2 rounded-lg border border-border/60 bg-background/30 px-3.5 py-2.5 text-sm transition-all duration-200 hover:border-primary/30 hover:text-primary cursor-pointer">
              <Sparkles className="h-3 w-3 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
              <span>{q}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="surface-card p-5 lg:col-span-2">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--color-success)]/10">
            <ListChecks className="h-4 w-4 text-[color:var(--color-success)]" />
          </div>
          Recommended actions
        </h3>
        <div className="grid gap-2 md:grid-cols-2">
          {profile.recommendedActions.map((a) => (
            <div key={a} className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/30 px-3.5 py-2.5 text-sm transition-all duration-200 hover:border-[color:var(--color-success)]/30">
              <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--color-success)]" />
              <span>{a}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Trust & Risk ─── */
function TrustRisk({ profile }: { profile: DatasetProfile }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="surface-card p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
            <Activity className="h-4 w-4 text-primary" />
          </div>
          Trust breakdown
        </h3>
        <div className="space-y-4">
          {profile.trustBreakdown.map((b) => (
            <div key={b.label}>
              <div className="mb-1.5 flex items-baseline justify-between text-xs">
                <span className="font-medium">{b.label}</span>
                <span className="font-mono tabular-nums text-muted-foreground">{b.score.toFixed(0)} · w{(b.weight * 100).toFixed(0)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-700 ease-out" style={{ width: `${b.score}%` }} />
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">{b.note}</div>
            </div>
          ))}
        </div>
      </div>

      <SeverityList title="Risks" icon={AlertTriangle} items={profile.risks} empty="No major risks detected." />
      <SeverityList title="Contradictions" icon={GitCompareArrows} items={profile.contradictions} empty="No internal contradictions detected." variant="warning" />
      <HumanErrorPanel items={profile.humanErrors} />
    </div>
  );
}

/* ─── Severity List ─── */
function SeverityList({
  title, icon: Icon, items, empty, variant = "warning",
}: { title: string; icon: typeof AlertTriangle; items: string[]; empty: string; variant?: "warning" | "info" }) {
  return (
    <div className="surface-card p-5">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <div className={cn(
          "flex h-7 w-7 items-center justify-center rounded-md",
          variant === "warning" ? "bg-[color:var(--color-warning)]/10" : "bg-[color:var(--color-info)]/10",
        )}>
          <Icon className={cn("h-4 w-4", variant === "warning" ? "text-[color:var(--color-warning)]" : "text-[color:var(--color-info)]")} />
        </div>
        {title}
      </h3>
      {items.length ? (
        <ul className="space-y-2">
          {items.map((r) => {
            const sev = severityFor(r);
            const sty = severityStyle(sev);
            return (
              <li
                key={r}
                className="flex gap-2 rounded-lg border-l-2 bg-background/30 px-3.5 py-2.5 text-sm transition-all duration-200 hover:bg-background/50"
                style={{ borderLeftColor: sty.color }}
              >
                <span
                  className="mt-0.5 inline-flex h-5 shrink-0 items-center rounded-md px-1.5 font-mono text-[9px] font-bold tracking-wider"
                  style={{ background: `color-mix(in oklab, ${sty.color} 15%, transparent)`, color: sty.color }}
                >
                  {sty.label}
                </span>
                <span className="flex-1">{r}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-[color:var(--color-success)]/20 bg-[color:var(--color-success)]/5 px-3.5 py-2.5 text-sm text-[color:var(--color-success)]">
          <ShieldCheck className="h-4 w-4" /> {empty}
        </div>
      )}
    </div>
  );
}

/* ─── Human Error Panel ─── */
function HumanErrorPanel({ items }: { items: string[] }) {
  return (
    <div className="surface-card p-5 lg:col-span-3">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-destructive/10">
          <FileWarning className="h-4 w-4 text-destructive" />
        </div>
        Human-error signals
      </h3>
      {items.length ? (
        <div className="grid gap-2 md:grid-cols-2">
          {items.map((r) => {
            // pull out the first quoted column name for highlight
            const m = r.match(/'([^']+)'/);
            const col = m?.[1];
            return (
              <div
                key={r}
                className="rounded-lg border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-sm transition-all duration-200 hover:border-destructive/40"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div className="flex-1">
                    {col && (
                      <span className="mr-1.5 rounded-md bg-destructive/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-destructive">
                        {col}
                      </span>
                    )}
                    <span>{r.replace(/'[^']+'/, "").replace(/^\s+/, "")}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-[color:var(--color-success)]/20 bg-[color:var(--color-success)]/5 px-3.5 py-2.5 text-sm text-[color:var(--color-success)]">
          <ShieldCheck className="h-4 w-4" /> No suspicious values detected.
        </div>
      )}
    </div>
  );
}

/* ─── Report Tab ─── */
function ReportTab({
  profile, fileName, insights, narrative, story, runStory, aiBusy,
}: {
  profile: DatasetProfile; fileName: string; insights: { text: string; why?: string; confidence: number; tag: string }[];
  narrative: string; story: string; runStory: () => void; aiBusy: boolean;
}) {
  return (
    <div className="space-y-6">
      {/* Data Story section */}
      <div className="surface-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/10">
              <Sparkles className="h-4 w-4 text-accent" />
            </div>
            Data Story
            <span className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">AI-generated</span>
          </h3>
          <button
            onClick={runStory}
            disabled={aiBusy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-xs font-medium transition-all duration-200 hover:border-primary hover:bg-primary/5 disabled:opacity-40"
          >
            {aiBusy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />}
            {aiBusy ? "Composing…" : story ? "Regenerate story" : "Generate Data Story"}
          </button>
        </div>
        {story ? (
          <div className="prose prose-sm prose-invert max-w-none prose-headings:text-foreground prose-h2:mt-6 prose-h2:mb-3 prose-h2:text-base prose-h2:font-semibold prose-h2:text-primary prose-strong:text-foreground prose-li:my-1.5
            [&>h2]:flex [&>h2]:items-center [&>h2]:gap-2 [&>h2]:before:content-[''] [&>h2]:before:h-5 [&>h2]:before:w-1 [&>h2]:before:rounded-full [&>h2]:before:bg-gradient-to-b [&>h2]:before:from-primary [&>h2]:before:to-accent">
            <ReactMarkdown>{story}</ReactMarkdown>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-background/20 p-8 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              Click "Generate Data Story" to compose a presentation-ready summary with title, key insights, severity-tagged risks, and recommendations.
            </p>
          </div>
        )}
      </div>

      {/* Export PDF card */}
      <div className="surface-card relative overflow-hidden p-6">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-accent/5" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Download className="h-4 w-4 text-primary" /> Export full PDF report
            </h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-lg">
              Includes overview, narrative, insights with "why this matters", risks, contradictions, recommendations, column profile, and the data story.
            </p>
          </div>
          <button
            onClick={() => exportReportPDF({ profile, fileName, insights, story, narrative })}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-accent px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_0_30px_-6px_var(--color-primary)] transition-all duration-200 hover:opacity-90 hover:scale-105 active:scale-95"
          >
            <Download className="h-4 w-4" /> Download PDF
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Backend Column Table ─── */
function BackendColumnTable({ columns }: { columns: any[] }) {
  return (
    <div className="surface-card overflow-hidden">
      <div className="border-b border-border/60 px-5 py-3.5 text-sm font-semibold flex items-center gap-2">
        <Database className="h-4 w-4 text-primary" /> Column profile (Backend)
        <span className="ml-auto text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{columns.length} columns</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-secondary/30 text-muted-foreground">
            <tr>
              {["Column", "Type", "Missing %", "Unique", "Min", "Max", "Mean", "Median", "Std", "IQR Outliers"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left font-mono text-[10px] uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {columns.map((c) => (
              <tr key={c.name} className="border-t border-border/40 transition-colors hover:bg-primary/[0.03]">
                <td className="px-3 py-2.5 font-medium">{c.name}</td>
                <td className="px-3 py-2.5"><TypePill type={c.type} /></td>
                <td className="px-3 py-2.5 tabular-nums">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-[color:var(--color-warning)] transition-all duration-500" style={{ width: `${Math.min(100, c.missingPct)}%` }} />
                    </div>
                    <span className={c.missingPct > 20 ? "text-[color:var(--color-warning)] font-semibold" : ""}>{c.missingPct.toFixed(1)}%</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 tabular-nums">{c.unique}</td>
                <td className="px-3 py-2.5 tabular-nums">{c.min !== undefined && c.min !== null ? c.min.toFixed(2) : "—"}</td>
                <td className="px-3 py-2.5 tabular-nums">{c.max !== undefined && c.max !== null ? c.max.toFixed(2) : "—"}</td>
                <td className="px-3 py-2.5 tabular-nums">{c.mean !== undefined && c.mean !== null ? c.mean.toFixed(2) : "—"}</td>
                <td className="px-3 py-2.5 tabular-nums">{c.median !== undefined && c.median !== null ? c.median.toFixed(2) : "—"}</td>
                <td className="px-3 py-2.5 tabular-nums">{c.std !== undefined && c.std !== null ? c.std.toFixed(2) : "—"}</td>
                <td className="px-3 py-2.5 tabular-nums">
                  {c.outliers !== undefined && c.outliers !== null ? (
                    <span className={c.outliers > 0 ? "rounded-md bg-[color:var(--color-warning)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--color-warning)]" : ""}>
                      {c.outliers}
                    </span>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
