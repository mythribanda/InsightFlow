import React, { useMemo, useState, useEffect, useRef, Fragment } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { getVisualization, exportVisualizationCode } from "@/server/visualize";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend,
  CartesianGrid,
  BarChart,
  Bar,
  AreaChart,
  Area,
  Line,
  ComposedChart,
  LineChart,
  PieChart,
  Pie,
  Cell,
  Treemap,
  FunnelChart,
  Funnel,
  LabelList
} from "recharts";
import {
  Activity, AlertTriangle, BarChart3, Brain, Database, Download, FileWarning,
  Lightbulb, ListChecks, MessageSquare, Sparkles, Wand2, GitCompareArrows,
  LayoutDashboard, ShieldCheck, ShieldAlert, ShieldX, ChevronLeft, ChevronRight,
  Zap, Eye, Target, TrendingUp, Zap as ZapIcon, Loader2, Code, Info,
  ArrowRight, Lock, ChevronDown, CloudUpload, Layers
} from "lucide-react";
import { toPng } from "html-to-image";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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
import { exportCleanCSV } from "@/server/modeling";
import { DependencyHeatmaps } from "@/components/DependencyHeatmaps";
import { AnomalyPanel } from "@/components/AnomalyPanel";
import { QueryBox } from "@/components/QueryBox";
import { CalcColumnPanel } from "@/components/CalcColumnPanel";
import { ClusteringPanel } from "@/components/ClusteringPanel";
import { getTextAnalysis } from "@/server/textAnalysis";
import { Calculator } from "lucide-react";
import { CountUp } from "@/components/reactbits/CountUp";
import { BlurText } from "@/components/reactbits/BlurText";
import { Aurora } from "@/components/reactbits/Aurora";
import { AnimatedList } from "@/components/reactbits/AnimatedList";
import { ClickSpark } from "@/components/reactbits/ClickSpark";
import { AnimatedContent } from "@/components/reactbits/AnimatedContent";

export const Route = createFileRoute("/app")(  {
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
type Tab = "dashboard" | "overview" | "visualizations" | "insights" | "chat" | "modeling" | "report" | "anomaly" | "calc" | "clustering";

function Home() {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const [loadingSession, setLoadingSession] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (authLoading) return;

    if (!session) {
      navigate({ to: "/login" });
      return;
    }

    const userId = session.user.id;

    async function checkProfile() {
      try {
        const { data: userProfile, error: profileError } = await supabase
          .from("profiles")
          .select("display_name, phone")
          .eq("id", userId)
          .single();

        if (profileError || !userProfile?.display_name || !userProfile?.phone) {
          navigate({ to: "/complete-profile" });
        } else {
          setLoadingSession(false);
        }
      } catch (e) {
        console.error("Auth check failed:", e);
        navigate({ to: "/login" });
      }
    }
    checkProfile();
  }, [session, authLoading, navigate]);
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
  const [sessionId, setSessionId] = useState<string>( "");
  const [queryMode, setQueryMode] = useState<"sandbox" | "chat">("sandbox");
  // BlurText one-shot gate lives here in Home — Insights remounts on every tab switch
  // (AnimatedContent key={tab} fully unmounts it), so a ref inside Insights would reset every time.
  const blurSeenForFingerprintRef = useRef<string>("");
  const ask = useServerFn(askDataset);
  const runStartAnalysis = useServerFn(startAnalysis);
  const runGetAnalysisStatus = useServerFn(getAnalysisStatus);

  const insights = useMemo(() => (profile ? generateInsights(profile) : []), [profile]);
  const forecast = useMemo(() => (profile ? trendForecast(profile) : null), [profile]);
  const risk = useMemo(() => {
    if (!profile) return null;
    const trust = analysis ? analysis.trust_score : undefined;
    return computeRiskLevel(profile, trust);
  }, [profile, analysis]);

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
      const userId = session?.user?.id || "anonymous";
      const session_id = `session_${userId}_${crypto.randomUUID()}`;
      setSessionId(session_id);
      
      const dataDict: Record<string, unknown[]> = {};
      parsed.headers.forEach(h => {
        dataDict[h] = parsed.rows.map(r => r[h]);
      });
      
      await runStartAnalysis({ data: { session_id, data: dataDict } });
      
      let completed = false;
      let attempts = 0;
      while (!completed && attempts < 60) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const statusRes = await runGetAnalysisStatus({ data: { session_id } });
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

  const handleColumnCreated = (name: string, allValues: any[]) => {
    if (!profile) return;
    // Map allValues to the existing rows to add the new column
    const updatedRows = rows.map((row, idx) => ({
      ...row,
      [name]: allValues[idx],
    }));
    setRows(updatedRows);
    
    // Build updated headers
    const updatedHeaders = [...profile.columns.map(c => c.name), name];
    
    // Reprofile client side
    const p = profileDataset(updatedRows, updatedHeaders);
    setProfile(p);
    
    // Pull the updated backend analysis
    setAnalyzing(true);
    runGetAnalysisStatus({ data: { session_id: sessionId } })
      .then((statusRes: any) => {
        if (statusRes.status === "completed" && statusRes.result) {
          setAnalysis(statusRes.result);
          toast.success(`Calculated column '${name}' analysis refreshed.`);
        }
      })
      .catch((err: any) => {
        console.error("Failed to fetch updated analysis", err);
      })
      .finally(() => {
        setAnalyzing(false);
      });
  };

  const tabs: { id: Tab; label: string; icon: typeof Database; desc: string }[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, desc: "Overview" },
    { id: "overview", label: "Profiling", icon: Database, desc: "Column analysis" },
    { id: "insights", label: "Insights", icon: Lightbulb, desc: "Key findings" },
    { id: "modeling", label: "ML Models", icon: ZapIcon, desc: "Train & evaluate" },
    { id: "anomaly", label: "Anomalies", icon: ShieldAlert, desc: "Outlier detection" },
    { id: "clustering", label: "Clustering", icon: Target, desc: "K-Means & DBSCAN" },
    { id: "calc", label: "Calculated Cols", icon: Calculator, desc: "Create new columns" },
    { id: "chat", label: "Ask your data", icon: MessageSquare, desc: "AI chat" },
    { id: "visualizations", label: "Visualizations", icon: BarChart3, desc: "Auto and custom charts" },
    { id: "report", label: "Report", icon: Download, desc: "Export PDF" },
  ];

  // Landing (no dataset) — full-width hero
  if (loadingSession) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-5" />
        <div className="flex flex-col items-center space-y-4 relative">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <p className="text-xs text-muted-foreground font-mono">Checking active sessions...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background text-slate-100 flex flex-col relative overflow-hidden font-sans">
        {/* Soft background glows */}
        <div className="absolute top-[10%] left-[20%] w-[500px] h-[500px] rounded-full pointer-events-none z-0"
          style={{ background: "radial-gradient(circle, rgba(139,92,246,0.06), transparent 70%)" }} />
        <div className="absolute bottom-[10%] right-[10%] w-[600px] h-[600px] rounded-full pointer-events-none z-0"
          style={{ background: "radial-gradient(circle, rgba(34,197,94,0.05), transparent 70%)" }} />
        
        {/* Landing TopBar Navigation */}
        <TopBar persona={persona} setPersona={setPersona} hidePersona />

        <main className="flex-1 max-w-[1400px] mx-auto w-full px-6 py-12 flex items-center z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center w-full">
            {/* Left Pane (7 columns) */}
            <div className="lg:col-span-7 flex flex-col space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-primary w-fit select-none">
                <Sparkles className="h-3.5 w-3.5 animate-pulse text-primary" />
                AI-POWERED • ANALYST-GRADE • TRUSTED
              </div>

              <h2 className="text-4xl font-extrabold tracking-tight md:text-[54px] text-white leading-[1.1]">
                Turn raw data<br />
                into <span className="text-gradient">decisions</span>.
              </h2>

              <p className="max-w-xl text-base leading-relaxed text-slate-400">
                Upload your CSV or Excel file and get instant trust scores,
                risk analysis, behavioral insights, and AI-powered explanations.
              </p>

              {/* What you get section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-1 bg-primary rounded-full" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">What you get</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Card 1: Profiling Engine */}
                  <div className="surface-card p-5 flex flex-col justify-between group transition-all duration-300 hover:border-primary/40">
                    <div>
                      <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
                        <Activity className="h-5 w-5" />
                      </div>
                      <h4 className="text-sm font-bold text-white mb-2">Profiling Engine</h4>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Detect types, missing values, duplicates, outliers, and more — all computed instantly in your browser.
                      </p>
                    </div>
                    <div className="mt-5 flex items-center gap-1 text-[11px] font-bold text-primary group-hover:text-primary/80 transition-colors cursor-pointer select-none">
                      Data Profiling <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>

                  {/* Card 2: Trust & Risk */}
                  <div className="surface-card p-5 flex flex-col justify-between group transition-all duration-300 hover:border-secondary/40">
                    <div>
                      <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-secondary/10 text-secondary mb-4">
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <h4 className="text-sm font-bold text-white mb-2">Trust & Risk</h4>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Get a weighted trust score with contradictions, anomalies, and human-error signals highlighted.
                      </p>
                    </div>
                    <div className="mt-5 flex items-center gap-1 text-[11px] font-bold text-secondary group-hover:text-secondary/80 transition-colors cursor-pointer select-none">
                      Risk Analysis <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>

                  {/* Card 3: AI Reasoning */}
                  <div className="surface-card p-5 flex flex-col justify-between group transition-all duration-300 hover:border-success/40">
                    <div>
                      <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-success/10 text-success mb-4">
                        <MessageSquare className="h-5 w-5" />
                      </div>
                      <h4 className="text-sm font-bold text-white mb-2">AI Chat Panel</h4>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Ask questions in natural language and get immediate answers supported by code execution and profiling details.
                      </p>
                    </div>
                    <div className="mt-5 flex items-center gap-1 text-[11px] font-bold text-success group-hover:text-success/80 transition-colors cursor-pointer select-none">
                      AI Reasoning <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </div>

                {/* Secure Badge */}
                <div className="surface-card p-4 flex flex-col sm:flex-row items-center justify-between gap-4 select-none">
                  <div className="flex items-center gap-2.5">
                    <Lock className="h-4.5 w-4.5 text-success shrink-0" />
                    <span className="text-[11px] font-semibold text-slate-350">Your data is private and never leaves your browser.</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-2.5 py-1 rounded-full text-[9px] font-mono font-bold tracking-wide uppercase bg-white/5 border border-primary/20 text-primary flex items-center gap-1">
                      <Sparkles className="h-2.5 w-2.5" /> Instant profiling
                    </span>
                    <span className="px-2.5 py-1 rounded-full text-[9px] font-mono font-bold tracking-wide uppercase bg-white/5 border border-secondary/20 text-secondary flex items-center gap-1">
                      <ShieldCheck className="h-2.5 w-2.5" /> Trust & risk analysis
                    </span>
                    <span className="px-2.5 py-1 rounded-full text-[9px] font-mono font-bold tracking-wide uppercase bg-white/5 border border-success/20 text-success flex items-center gap-1">
                      <Brain className="h-2.5 w-2.5" /> AI-generated insights
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Pane (5 columns) */}
            <div className="lg:col-span-5 flex flex-col space-y-6">
              {/* Main Upload Box */}
              <div className="surface-card p-8 shadow-2xl flex flex-col items-center relative overflow-hidden"
                   style={{ boxShadow: "0 20px 50px rgba(0,0,0,0.5), 0 0 100px rgba(139,92,246,0.06)" }}>
                {/* Dotted border outline accent */}
                <div className="absolute inset-2 border border-dashed border-primary/10 rounded-2xl pointer-events-none" />

                {/* 3D Orbiting Icon container */}
                <div className="relative w-full h-44 flex items-center justify-center overflow-visible select-none mb-4">
                  {/* Orbit rings */}
                  <svg className="absolute w-full h-full overflow-visible pointer-events-none" viewBox="0 0 400 200">
                    <defs>
                      <radialGradient id="orbitGlow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
                      </radialGradient>
                      <linearGradient id="orbitRing" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.5" />
                        <stop offset="50%" stopColor="#22C55E" stopOpacity="0.1" />
                        <stop offset="100%" stopColor="#A855F7" stopOpacity="0.5" />
                      </linearGradient>
                    </defs>
                    {/* Shadow under the document */}
                    <ellipse cx="200" cy="125" rx="60" ry="14" fill="url(#orbitGlow)" />
                    {/* Elliptical Rings */}
                    <ellipse cx="200" cy="95" rx="130" ry="36" fill="none" stroke="url(#orbitRing)" strokeWidth="1.5" strokeDasharray="6 4" className="animate-spin-slow" style={{ transformOrigin: "200px 95px" }} />
                    <ellipse cx="200" cy="95" rx="100" ry="26" fill="none" stroke="url(#orbitRing)" strokeWidth="1" strokeDasharray="3 6" className="animate-spin-reverse-slow" style={{ transformOrigin: "200px 95px" }} />
                  </svg>

                  {/* Floating orbiting dots */}
                  <div className="absolute w-2.5 h-2.5 rounded-full bg-[#8B5CF6] blur-[0.5px] animate-orbit-particle" style={{ left: 'calc(50% - 5px)', top: 'calc(50% - 5px)' }} />
                  <div className="absolute w-2 h-2 rounded-full bg-[#22C55E] blur-[0.5px] animate-orbit-particle-inner" style={{ left: 'calc(50% - 4px)', top: 'calc(50% - 4px)' }} />

                  {/* 3D Document Card */}
                  <div className="absolute animate-float-3d" style={{ transformStyle: 'preserve-3d', perspective: '1000px' }}>
                    <div className="relative w-20 h-24 bg-white rounded-xl flex flex-col p-2.5 overflow-hidden shadow-2xl"
                         style={{
                           transformStyle: 'preserve-3d',
                           boxShadow: '20px 20px 40px rgba(0,0,0,0.55), -1px -1px 6px rgba(255,255,255,0.9) inset',
                         }}>
                      {/* Dog ear */}
                      <div className="absolute top-0 right-0 w-5 h-5"
                           style={{
                             background: 'linear-gradient(135deg, transparent 50%, #cbd5e1 50%)',
                             clipPath: 'polygon(0 0, 100% 100%, 0 100%)',
                             transform: 'translate(1px, -1px) scale(1.02)'
                           }} />
                      {/* CSV tag */}
                      <div className="bg-emerald-500 text-white font-sans font-black text-[9px] px-1.5 py-0.5 rounded w-fit tracking-wide shadow-sm"
                           style={{ transform: 'translateZ(10px)' }}>
                        CSV
                      </div>
                      {/* Grid representation */}
                      <div className="mt-2.5 flex-1 flex flex-col gap-1 opacity-70"
                           style={{ transform: 'translateZ(5px)' }}>
                        <div className="grid grid-cols-3 gap-0.5">
                          <div className="h-1.5 bg-slate-300 rounded-sm" />
                          <div className="h-1.5 bg-slate-300 rounded-sm" />
                          <div className="h-1.5 bg-slate-300 rounded-sm" />
                        </div>
                        <div className="grid grid-cols-3 gap-0.5">
                          <div className="h-1.5 bg-slate-300 rounded-sm" />
                          <div className="h-1.5 bg-slate-300 rounded-sm" />
                          <div className="h-1.5 bg-slate-300 rounded-sm" />
                        </div>
                        <div className="grid grid-cols-3 gap-0.5">
                          <div className="h-1.5 bg-slate-300 rounded-sm" />
                          <div className="h-1.5 bg-slate-300 rounded-sm" />
                          <div className="h-1.5 bg-slate-300 rounded-sm" />
                        </div>
                        <div className="grid grid-cols-3 gap-0.5">
                          <div className="h-1.5 bg-slate-300 rounded-sm" />
                          <div className="h-1.5 bg-slate-300 rounded-sm" />
                          <div className="h-1.5 bg-slate-300 rounded-sm" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-center mb-6 z-10 select-none">
                  <h3 className="text-base font-bold text-white mb-1">Upload your CSV or Excel file</h3>
                  <p className="text-[11px] text-muted-foreground">Drag and drop your file here or <span className="text-primary font-semibold">browse</span></p>
                </div>

                {/* Inner dashed dropzone container */}
                <div className="w-full relative z-10">
                  <FileDrop onFile={handleFile} busy={busy} />
                </div>

                <div className="mt-4 text-[10px] text-slate-500 font-medium select-none text-center">
                  Supported formats: .csv, .tsv, .xlsx, .xls • Max size: 25MB
                </div>

                {/* Secure bottom indicator */}
                <div className="w-full mt-6 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-md p-4 flex items-center gap-3 select-none">
                  <ShieldCheck className="h-6 w-6 text-success shrink-0" />
                  <div className="flex-1">
                    <h5 className="text-[11px] font-bold text-white">Secure & Private</h5>
                    <p className="text-[10px] text-muted-foreground leading-normal">Your data is processed locally in your browser. We never store or send your files anywhere.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
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
                  "group flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]",
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
                "w-full rounded-lg border border-border bg-secondary/40 text-xs transition-all duration-200 hover:border-primary hover:bg-primary/5 hover:scale-[1.02] active:scale-[0.98]",
                sidebarCollapsed ? "p-2.5 flex justify-center" : "px-3 py-2",
              )}
            >
              {sidebarCollapsed ? <Database className="h-4 w-4" /> : "Upload new dataset"}
            </button>
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="flex w-full items-center justify-center rounded-lg border border-border bg-secondary/20 p-1.5 text-muted-foreground transition-all hover:bg-secondary/50 hover:text-foreground active:scale-95"
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
                  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]",
                  tab === t.id ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:bg-secondary",
                )}
              >
                <t.icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            ))}
          </nav>


          <AnimatedContent key={tab} animation="slide-up" duration={320}>
            {tab === "dashboard" && profile && risk && (
              <div className="space-y-6">
                {analyzing && (
                  <div className="surface-card p-6 flex flex-col items-center justify-center space-y-4">
                    <span className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    <p className="text-sm font-medium text-muted-foreground">Running backend intelligence profiling...</p>
                  </div>
                )}
                <Dashboard
                  profile={profile}
                  risk={risk}
                  insights={insights}
                  fileName={fileName}
                  onJump={setTab}
                  analysis={analysis}
                  sessionId={sessionId}
                />
              </div>
            )}
            {tab === "overview" && (
              <Profiling
                profile={profile}
                forecast={forecast}
                narrative={narrative}
                runNarrative={() => runAi("narrative")}
                aiBusy={aiBusy === "narrative"}
                sessionId={sessionId}
                analysis={analysis}
              />
            )}
            {tab === "insights" && <Insights insights={insights} profile={profile} hasBlurredRef={blurSeenForFingerprintRef} analysis={analysis} />}
            {tab === "modeling" && <ModelingPanel data={rows} columns={profile?.columns.map(c => c.name) || []} sessionId={sessionId} />}
            {tab === "anomaly" && <AnomalyPanel sessionId={sessionId} />}
            {tab === "clustering" && profile && (
              <ClusteringPanel sessionId={sessionId} profile={profile} />
            )}
            {tab === "calc" && (
              <CalcColumnPanel
                sessionId={sessionId}
                rows={rows}
                headers={profile?.columns.map(c => c.name) || []}
                onColumnCreated={handleColumnCreated}
              />
            )}
            {tab === "chat" && (
              <div className="space-y-6">
                {/* Mode toggle */}
                <div className="flex rounded-lg bg-secondary/50 p-0.5 border border-border w-fit">
                  <button
                    onClick={() => setQueryMode("sandbox")}
                    className={`rounded-md px-3 py-1 text-[10px] font-medium transition-colors cursor-pointer ${
                      queryMode === "sandbox"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Sandbox
                  </button>
                  <button
                    onClick={() => setQueryMode("chat")}
                    className={`rounded-md px-3 py-1 text-[10px] font-medium transition-colors cursor-pointer ${
                      queryMode === "chat"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    AI Chat
                  </button>
                </div>

                {queryMode === "sandbox" ? (
                  <QueryBox sessionId={sessionId} />
                ) : (
                  <ChatPanel profile={profile} persona={persona} suggestions={profile.suggestedQuestions} sessionId={sessionId} analysis={analysis} />
                )}
              </div>
            )}
            {tab === "visualizations" && profile && (
              <Visualizations profile={profile} sessionId={sessionId} rows={rows} />
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
                analysis={analysis}
              />
            )}
          </AnimatedContent>
        </main>
      </div>
    </div>
  );
}

/* ─── TopBar ─── */
function TopBar({ persona, setPersona, hidePersona }: { persona: Persona; setPersona: (p: Persona) => void; hidePersona?: boolean }) {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Sign out helper
  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      toast.success("Signed out successfully");
      navigate({ to: "/login" });
    } catch (err) {
      console.error("Sign out error:", err);
      toast.error("Failed to sign out");
    }
  };

  // Get user initials
  const email = session?.user?.email || "";
  const name = session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name || email;
  const initials = name
    ? name.split(" ").map((p: string) => p[0]).join("").substring(0, 2).toUpperCase()
    : "US";

  return (
    <header className="glass-topbar sticky top-0 z-20">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-6 py-2.5">
        {/* Left Logo Section */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent shadow-[0_0_24px_-4px_var(--color-primary)]">
            <Brain className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-tight">
              Insight<span className="text-gradient">Flow</span>
            </h1>
            <p className="text-[9px] text-muted-foreground font-mono uppercase tracking-wider">From raw data to real decisions.</p>
          </div>
        </div>

        {/* Center Section: Persona Selector on App Page only */}
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

        {/* Right Section: Profile initials Dropdown */}
        <div className="flex items-center gap-3">

          {/* Profile Dropdown */}
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-1.5 p-1 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer select-none"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#A855F7] text-[10px] font-black text-white uppercase tracking-wider shadow-sm">
                {initials}
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>

            {dropdownOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setDropdownOpen(false)} />
                <div className="absolute right-0 mt-2 w-48 rounded-xl border border-white/10 bg-[#15151F] p-1.5 backdrop-blur-md shadow-2xl z-40 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-3 py-2 border-b border-white/5 text-xs text-muted-foreground">
                    Logged in as <span className="font-semibold text-foreground block truncate">{email}</span>
                  </div>
                  <button
                    onClick={() => { setDropdownOpen(false); navigate({ to: "/profile" }); }}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    My Profile
                  </button>
                  <button
                    onClick={() => { setDropdownOpen(false); handleSignOut(); }}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                  >
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
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

function Dashboard({
  profile, risk, insights, fileName, onJump, analysis, sessionId,
}: {
  profile: DatasetProfile;
  risk: { level: "low" | "medium" | "high"; reasons: string[] };
  insights: { text: string; why?: string; confidence: number; tag: string }[];
  fileName: string;
  onJump: (t: Tab) => void;
  analysis: AnalysisResult | null;
  sessionId: string;
}) {
  const trustScore = analysis ? analysis.trust_score : undefined;
  const trustColor = trustScore !== undefined
    ? (trustScore >= 80 ? "var(--color-success)" : trustScore >= 55 ? "var(--color-warning)" : "var(--color-destructive)")
    : "var(--color-muted)";
  
  const rowCount = analysis ? analysis.shape.rows : profile.rowCount;
  const colCount = analysis ? analysis.shape.cols : profile.colCount;
  const totalCells = analysis ? analysis.shape.total_cells : (profile.rowCount * profile.colCount);
  const trustBreakdown = analysis ? analysis.trust_breakdown : undefined;

  const firstCat = profile.columns.find((c) => c.type === "categorical" && c.topValues?.length);
  const miniData = firstCat?.topValues?.slice(0, 5).map((t) => ({ value: String(t.value).slice(0, 12), count: t.count })) ?? [];

  return (
    <div className="space-y-6">
      {/* Header strip with Aurora background */}
      <div className="surface-card relative overflow-hidden p-6">
        <Aurora colors={["hsl(192 100% 50% / 0.12)","hsl(262 100% 65% / 0.10)","hsl(220 100% 60% / 0.09)"]} blur={90} speed={0.6} />
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-accent/5" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">active dataset</div>
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
            <button
              onClick={() => onJump("report")}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-accent px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_0_30px_-6px_var(--color-primary)] transition-all duration-200 hover:opacity-90 hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Download className="h-4 w-4" /> Export Report
            </button>
          </div>
        </div>
      </div>

      {/* Dataset Shape & Trust Score Section */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Shape and Info Card */}
        <div className="surface-card p-5 flex flex-col justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">dataset shape</div>
            <div className="mt-2 text-2xl font-bold text-gradient"><CountUp to={rowCount} from={0} duration={1.4} separator="," /> rows</div>
            <div className="text-lg font-semibold text-muted-foreground">{colCount} columns</div>
            <div className="mt-1 text-xs text-muted-foreground"><CountUp to={totalCells} from={0} duration={1.6} separator="," /> total cells</div>
          </div>
          <div className="mt-4 border-t border-border/40 pt-4 flex gap-4">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono font-semibold">risk level</span>
              <div className="mt-1 flex items-center gap-2">
                <RiskBadge level={risk.level} />
                {risk.reasons.length > 0 && (
                  <span className="text-[10px] text-muted-foreground italic">
                    {risk.reasons.length} flags detected
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Trust Score Breakdown Card */}
        <div className="surface-card p-5 lg:col-span-2 flex flex-col md:flex-row gap-6">
          <div className="flex flex-col items-center justify-center shrink-0 w-full md:w-48 border-b md:border-b-0 md:border-r border-border/40 pb-6 md:pb-0 md:pr-6">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">trust score</span>
            {analysis ? (
              <div className="mt-3 text-6xl font-extrabold flex flex-col items-center animate-pulse-glow" style={{ color: trustColor }}>
                <CountUp to={analysis.trust_score} from={0} duration={1.8} />
              </div>
            ) : (
              <div className="mt-3 flex flex-col items-center justify-center animate-pulse">
                <div className="h-12 w-20 bg-muted/30 rounded" />
                <span className="text-[10px] text-primary/75 font-medium mt-2.5 uppercase tracking-wider">Analyzing...</span>
              </div>
            )}
            <span className="mt-2 text-[10px] text-muted-foreground text-center">Composite quality metric</span>
          </div>
          <div className="flex-1 space-y-3">
            {analysis && trustBreakdown ? (
              trustBreakdown.map((b) => (
                <div key={b.label} className="text-xs">
                  <div className="flex justify-between font-medium mb-0.5">
                    <span>{b.label}</span>
                    <span className="text-muted-foreground font-mono">{b.score.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500" style={{ width: `${b.score}%` }} />
                  </div>
                  <div className="mt-0.5 text-[9px] text-muted-foreground">{b.note}</div>
                </div>
              ))
            ) : (
              <div className="space-y-4 animate-pulse">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex justify-between">
                      <div className="h-3 w-20 bg-muted/30 rounded" />
                      <div className="h-3 w-8 bg-muted/30 rounded" />
                    </div>
                    <div className="h-1.5 rounded-full bg-muted/20" />
                    <div className="h-2 w-1/2 bg-muted/20 rounded" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Rows" value={<CountUp to={profile.rowCount} from={0} duration={1.2} separator="," />} icon={Database} accent="primary" />
        <MetricCard label="Columns" value={profile.colCount} icon={BarChart3} accent="primary" />
        <MetricCard
          label="Missing cells"
          value={<><CountUp to={profile.missingPct} from={0} duration={1.3} decimals={1} />%</>}
          hint={`${profile.missingCells.toLocaleString()} total cells missing`}
          icon={Eye}
          accent={profile.missingPct > 10 ? "warning" : "success"}
        />
        <MetricCard
          label="Duplicate rows"
          value={<CountUp to={profile.duplicateRows} from={0} duration={1.2} separator="," />}
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
            <button onClick={() => onJump("insights")} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground transition-colors hover:border-primary hover:text-primary cursor-pointer">
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
            <button onClick={() => onJump("visualizations")} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground transition-colors hover:border-primary hover:text-primary cursor-pointer">
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

      {/* Column Profile Table */}
      {analysis ? (
        <BackendColumnTable columns={analysis.columns} />
      ) : (
        <ColumnTable profile={profile} sessionId={sessionId} />
      )}

      {/* Dependency Heatmaps */}
      {analysis ? (
        <DependencyHeatmaps
          columns={analysis.dependency.columns}
          pearson={analysis.dependency.pearson}
          spearman={analysis.dependency.spearman}
          mutual_info={analysis.dependency.mutual_info}
        />
      ) : (
        <div className="surface-card p-6 flex flex-col items-center justify-center min-h-[300px]">
          <BarChart3 className="h-8 w-8 text-primary animate-pulse mb-3" />
          <p className="text-sm font-semibold text-foreground">Advanced Dependency Heatmaps</p>
          <p className="text-xs text-muted-foreground max-w-sm text-center mt-1">
            Linear correlations and non-linear Mutual Information dependencies will be available once backend intelligence profiling completes.
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── Profiling ─── */
function Profiling({
  profile, forecast, narrative, runNarrative, aiBusy, sessionId, analysis,
}: {
  profile: DatasetProfile;
  forecast: string | null;
  narrative: string;
  runNarrative: () => void;
  aiBusy: boolean;
  sessionId: string;
  analysis: AnalysisResult | null;
}) {
  const runExportCleanCSV = useServerFn(exportCleanCSV);
  const [isExporting, setIsExporting] = useState(false);

  const handleDownloadCleanCSV = async () => {
    if (!sessionId) {
      toast.error("No active session found.");
      return;
    }
    setIsExporting(true);
    try {
      const csvContent = await runExportCleanCSV({
        data: {
          session_id: sessionId,
          excluded_features: [],
        },
      });

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `insightflow_clean_${sessionId}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("Clean CSV downloaded successfully!");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to export CSV");
    } finally {
      setIsExporting(false);
    }
  };

  const getTrustBadgeClass = (score: number) => {
    if (score >= 80) return "bg-[color:var(--color-success)]/15 text-[color:var(--color-success)] border-[color:var(--color-success)]/30";
    if (score >= 50) return "bg-[color:var(--color-warning)]/15 text-[color:var(--color-warning)] border-[color:var(--color-warning)]/30";
    return "bg-destructive/15 text-destructive border-destructive/30";
  };

  const currentTrustScore = analysis ? analysis.trust_score : undefined;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <TrustGauge score={currentTrustScore} />
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

      <ColumnTable profile={profile} sessionId={sessionId} />
      <PreviewTable profile={profile} />

      {/* Export Clean Dataset Card */}
      <div className="surface-card relative overflow-hidden p-6">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-accent/5" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Download className="h-4 w-4 text-primary" /> Export Clean Dataset
              </h3>
              {analysis ? (
                <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wider", getTrustBadgeClass(analysis.trust_score))}>
                  Data Trust: {analysis.trust_score}/100
                </span>
              ) : (
                <span className="rounded-full border border-border bg-secondary/40 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground animate-pulse">
                  Data Trust: Loading...
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground max-w-lg">
              Download the clean dataset. Missing values imputed, outliers marked, and duplicate rows dropped.
            </p>
          </div>
          <ClickSpark sparkCount={10} sparkColor="#A855F7" sparkRadius={52} duration={550}>
            <button
              onClick={handleDownloadCleanCSV}
              disabled={isExporting || !sessionId}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-accent px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_0_30px_-6px_var(--color-primary)] transition-all duration-200 hover:opacity-90 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none"
            >
              {isExporting ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {isExporting ? "Exporting..." : "Download Preprocessed CSV"}
            </button>
          </ClickSpark>
        </div>
      </div>
    </div>
  );
}

/* ─── Column Table ─── */
function ColumnTable({ profile, sessionId }: { profile: DatasetProfile; sessionId: string }) {
  const fetchTextAnalysis = useServerFn(getTextAnalysis);
  const [expandedCols, setExpandedCols] = useState<Record<string, boolean>>({});
  const [textAnalysisData, setTextAnalysisData] = useState<Record<string, any>>({});
  const [loadingTextCols, setLoadingTextCols] = useState<Record<string, boolean>>({});

  const loadTextAnalysis = async (colName: string) => {
    if (expandedCols[colName]) {
      setExpandedCols((prev) => ({ ...prev, [colName]: false }));
      return;
    }
    setExpandedCols((prev) => ({ ...prev, [colName]: true }));

    if (textAnalysisData[colName]) return;

    setLoadingTextCols((prev) => ({ ...prev, [colName]: true }));
    try {
      const res = await fetchTextAnalysis({ data: { session_id: sessionId, column: colName } });
      setTextAnalysisData((prev) => ({ ...prev, [colName]: res }));
    } catch (err) {
      console.error("Text analysis error:", err);
      toast.error(`Text analysis failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoadingTextCols((prev) => ({ ...prev, [colName]: false }));
    }
  };

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
              <React.Fragment key={c.name}>
                <tr className="border-t border-border/40 transition-colors hover:bg-primary/[0.03]">
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
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {c.constant && <span className="rounded-md bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">constant</span>}
                      {c.highCardinality && <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">high-card</span>}
                      {(c.outliers ?? 0) > 0 && <span className="rounded-md bg-[color:var(--color-warning)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--color-warning)]">{c.outliers} outliers</span>}
                      {(c.isFreeText || c.is_free_text) && (
                        <button
                          type="button"
                          onClick={() => loadTextAnalysis(c.name)}
                          className="rounded-md bg-primary/15 border border-primary/30 hover:bg-primary/25 px-2 py-0.5 text-[10px] font-bold text-primary transition-all active:scale-95 cursor-pointer"
                        >
                          {expandedCols[c.name] ? "Hide Terms" : "View Top Terms"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {expandedCols[c.name] && (
                  <tr className="bg-muted/10">
                    <td colSpan={8} className="p-5 border-t border-b border-border/60">
                      <div className="space-y-4">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                          <Layers className="h-4 w-4 text-primary" />
                          Text / NLP Analytics: {c.name}
                        </h4>

                        {loadingTextCols[c.name] ? (
                          <div className="flex items-center gap-2 py-4 text-muted-foreground">
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                            <span className="font-mono text-xs">Running TF-IDF top term analysis...</span>
                          </div>
                        ) : textAnalysisData[c.name] ? (
                          <div className="grid gap-6 md:grid-cols-2">
                            {/* TF-IDF Bar List */}
                            <div className="space-y-3">
                              <h5 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                Top Terms by TF-IDF Score
                              </h5>
                              <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-2 scrollbar-thin">
                                {textAnalysisData[c.name].top_terms.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">No terms extracted.</p>
                                ) : (
                                  textAnalysisData[c.name].top_terms.map((t: any) => {
                                    const maxScore = textAnalysisData[c.name].top_terms[0]?.score || 1;
                                    const pct = Math.min(100, (t.score / maxScore) * 100);
                                    return (
                                      <div key={t.term} className="space-y-1">
                                        <div className="flex justify-between text-xs font-mono">
                                          <span className="text-slate-200 font-medium">{t.term}</span>
                                          <span className="text-muted-foreground">{t.score.toFixed(3)}</span>
                                        </div>
                                        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                                          <div className="h-full bg-gradient-to-r from-primary/80 to-accent/70 transition-all duration-300" style={{ width: `${pct}%` }} />
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>

                            {/* Descriptive Stats */}
                            <div className="space-y-4 p-4 rounded-xl border border-border/80 bg-card/45">
                              <h5 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                Descriptive Text Statistics
                              </h5>
                              <div className="space-y-2">
                                <div className="flex justify-between text-xs py-1 border-b border-border/30">
                                  <span className="text-muted-foreground font-medium">Analyzed Samples</span>
                                  <span className="font-mono text-white font-medium">
                                    {textAnalysisData[c.name].sample_count} rows
                                  </span>
                                </div>
                                <div className="flex justify-between text-xs py-1 border-b border-border/30">
                                  <span className="text-muted-foreground font-medium">Average Word Count</span>
                                  <span className="font-mono text-white font-medium">
                                    {textAnalysisData[c.name].avg_word_count} words
                                  </span>
                                </div>
                              </div>
                              <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Top terms are extracted using **TF-IDF Vectorization** (Term Frequency - Inverse Document Frequency), which ranks words by how unique and informative they are to individual rows relative to the whole column. Common English stop words are excluded.
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-red-400">Failed to load text analysis.</p>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
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
  insights, profile, hasBlurredRef, analysis,
}: {
  insights: { text: string; why?: string; confidence: number; tag: string }[];
  profile: DatasetProfile;
  hasBlurredRef: React.MutableRefObject<string>;
  analysis: AnalysisResult | null;
}) {
  const trustScore = analysis ? analysis.trust_score : undefined;
  const trustColor = trustScore !== undefined
    ? (trustScore >= 80 ? "var(--color-success)" : trustScore >= 50 ? "var(--color-warning)" : "var(--color-destructive)")
    : "var(--color-muted)";
  // Gate reads from the ref that lives in Home — survives tab switches, resets only on new dataset
  const insightFingerprint = insights.map(i => i.tag).join("-");
  const isFirstRender = hasBlurredRef.current !== insightFingerprint;
  if (isFirstRender) hasBlurredRef.current = insightFingerprint;
  
  const hasClassImbalance = profile.risks.some(r => /imbalance|imbalanced|dominated/i.test(r)) ||
    profile.columns.some(c => c.type === "categorical" && c.topValues && c.topValues[0] && (c.topValues[0].count / Math.max(c.count - c.missing, 1) > 0.85));

  const hasLeakageRisk = profile.risks.some(r => /leakage|correlation|perfectly correlated/i.test(r)) ||
    profile.contradictions.some(c => /leakage|correlation|perfectly correlated/i.test(c));

  const hasHighMissingValues = profile.missingPct > 10 || profile.columns.some(c => c.missingPct > 30);

  const recommendations: string[] = [];
  if (hasClassImbalance) {
    profile.columns.forEach(c => {
      if (c.type === "categorical" && c.topValues && c.topValues[0] && (c.topValues[0].count / Math.max(c.count - c.missing, 1) > 0.85)) {
        recommendations.push(`Use class weighting or SMOTE for dominated column '${c.name}' (dominated by "${c.topValues[0].value}").`);
      }
    });
    if (recommendations.length === 0) {
      recommendations.push("Apply class balancing techniques (e.g., SMOTE, class weights) for skewed target/categorical variables.");
    }
  }
  if (hasLeakageRisk) {
    const leakageColumns: string[] = [];
    profile.risks.forEach(r => {
      const match = r.match(/'([^']+)'/);
      if (match && /leakage|correlation/i.test(r)) {
        leakageColumns.push(match[1]);
      }
    });
    profile.contradictions.forEach(c => {
      const match = c.match(/'([^']+)'/);
      if (match && /leakage|correlation/i.test(c)) {
        leakageColumns.push(match[1]);
      }
    });
    if (leakageColumns.length > 0) {
      const uniqueCols = Array.from(new Set(leakageColumns));
      uniqueCols.forEach(col => {
        recommendations.push(`Drop leakage feature '${col}' to prevent target leakage.`);
      });
    } else {
      recommendations.push("Inspect and remove features that have near-perfect correlation with the target variable.");
    }
  }
  if (hasHighMissingValues) {
    profile.columns.forEach(c => {
      if (c.missingPct > 30) {
        recommendations.push(`Impute missing values in '${c.name}' (${c.missingPct.toFixed(0)}% missing) or consider dropping it.`);
      }
    });
    if (profile.missingPct > 10 && !profile.columns.some(c => c.missingPct > 30)) {
      recommendations.push(`Impute missing cells (overall ${profile.missingPct.toFixed(1)}% missingness) to prevent training bias.`);
    }
  }

  return (
    <div className="space-y-6">
      {/* Data Health & Risk Assessment Card */}
      <div className="surface-card p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-accent/5" />
        <div className="relative space-y-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-semibold">Data Health & Risk Assessment</h3>
          </div>
          
          <div className="grid gap-6 md:grid-cols-3 border-t border-border/40 pt-4">
            {/* Trust Score Section */}
            <div className="flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-border/40 pb-6 md:pb-0 md:pr-6 text-center">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">trust score</span>
              {analysis ? (
                <div className="mt-2 text-5xl font-extrabold flex flex-col items-center animate-pulse-glow" style={{ color: trustColor }}>
                  <CountUp to={analysis.trust_score} from={0} duration={1.8} />
                </div>
              ) : (
                <div className="mt-3 flex flex-col items-center justify-center animate-pulse">
                  <div className="h-10 w-16 bg-muted/30 rounded" />
                  <span className="text-[9px] text-primary/75 font-medium mt-2 uppercase tracking-wider">Analyzing...</span>
                </div>
              )}
              <span className="mt-1.5 text-xs text-muted-foreground">Composite quality metric</span>
            </div>

            {/* Risk Checklist */}
            <div className="space-y-3.5 border-b md:border-b-0 md:border-r border-border/40 pb-6 md:pb-0 md:pr-6">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">risk checklist</div>
              
              {/* Class Imbalance Flag */}
              <div className="flex items-start gap-2.5 text-xs">
                {hasClassImbalance ? (
                  <ShieldAlert className="mt-0.5 h-4 w-4 text-[color:var(--color-warning)] shrink-0" />
                ) : (
                  <ShieldCheck className="mt-0.5 h-4 w-4 text-[color:var(--color-success)] shrink-0" />
                )}
                <div>
                  <div className="font-semibold">Class imbalance</div>
                  <div className="text-[10px] text-muted-foreground">
                    {hasClassImbalance ? "Flagged: Target or categorical column heavily skewed" : "Optimal class distribution"}
                  </div>
                </div>
              </div>

              {/* Leakage Risk Flag */}
              <div className="flex items-start gap-2.5 text-xs">
                {hasLeakageRisk ? (
                  <ShieldX className="mt-0.5 h-4 w-4 text-destructive shrink-0" />
                ) : (
                  <ShieldCheck className="mt-0.5 h-4 w-4 text-[color:var(--color-success)] shrink-0" />
                )}
                <div>
                  <div className="font-semibold">Leakage risk</div>
                  <div className="text-[10px] text-muted-foreground">
                    {hasLeakageRisk ? "Flagged: Features perfectly correlated or leak target signal" : "No significant leakage risk"}
                  </div>
                </div>
              </div>

              {/* High Missing Flag */}
              <div className="flex items-start gap-2.5 text-xs">
                {hasHighMissingValues ? (
                  <ShieldAlert className="mt-0.5 h-4 w-4 text-[color:var(--color-warning)] shrink-0" />
                ) : (
                  <ShieldCheck className="mt-0.5 h-4 w-4 text-[color:var(--color-success)] shrink-0" />
                )}
                <div>
                  <div className="font-semibold">High missing values</div>
                  <div className="text-[10px] text-muted-foreground">
                    {hasHighMissingValues ? "Flagged: High missingness overall or in individual features" : "Optimal missing value percentage"}
                  </div>
                </div>
              </div>
            </div>

            {/* Recommended Actions */}
            <div className="space-y-2">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">recommended actions</div>
              {recommendations.length > 0 ? (
                <AnimatedList
                  items={recommendations.map((rec, index) => (
                    <div key={index} className="flex items-start gap-2 text-xs">
                      <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span>{rec}</span>
                    </div>
                  ))}
                  itemDelay={100}
                />
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-[color:var(--color-success)]/20 bg-[color:var(--color-success)]/5 px-3 py-2 text-xs text-[color:var(--color-success)]">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  <span>All checks passed! No critical data quality actions recommended.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="surface-card p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
              <Lightbulb className="h-4 w-4 text-primary" />
            </div>
            Key findings
          </h3>
          {/* BlurText one-shot: fires on first tab visit per dataset, not on every re-entry */}
          <AnimatedList
            items={insights.map((i, idx) => (
              <div key={idx} className="group rounded-lg border border-border/60 bg-background/30 p-3.5 transition-all duration-200 hover:border-primary/30 hover:bg-primary/[0.02]">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-7 min-w-[3rem] items-center justify-center rounded-md bg-primary/10 font-mono text-[10px] font-semibold text-primary">
                    {(i.confidence * 100).toFixed(0)}%
                  </div>
                  <div className="flex-1">
                    <span className="mr-2 rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{i.tag}</span>
                    <span className="text-sm">
                      {isFirstRender ? (
                        <BlurText text={i.text} delay={idx * 60 + 40} animateDuration={450} />
                      ) : (
                        <ReactMarkdown components={{ p: ({ children }) => <span>{children}</span> }}>{i.text}</ReactMarkdown>
                      )}
                    </span>
                    {i.why && (
                      <div className="mt-2 rounded-md bg-background/40 px-2.5 py-1.5 text-xs text-muted-foreground">
                        <span className="font-semibold text-primary/80">Why this matters: </span>{i.why}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            itemDelay={90}
            animateDuration={350}
          />
        </div>

        <div className="surface-card p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/10">
              <MessageSquare className="h-4 w-4 text-accent" />
            </div>
            Suggested questions
          </h3>
          <AnimatedList
            items={profile.suggestedQuestions.map((q) => (
              <div className="group flex items-center gap-2 rounded-lg border border-border/60 bg-background/30 px-3.5 py-2.5 text-sm transition-all duration-200 hover:border-primary/30 hover:text-primary cursor-pointer">
                <Sparkles className="h-3 w-3 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                <span>{q}</span>
              </div>
            ))}
            itemDelay={70}
          />
        </div>

        <div className="surface-card p-5 lg:col-span-2">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--color-success)]/10">
              <ListChecks className="h-4 w-4 text-[color:var(--color-success)]" />
            </div>
            Recommended actions
          </h3>
          <AnimatedList
            items={profile.recommendedActions.map((a) => (
              <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/30 px-3.5 py-2.5 text-sm transition-all duration-200 hover:border-[color:var(--color-success)]/30">
                <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--color-success)]" />
                <span>{a}</span>
              </div>
            ))}
            itemDelay={80}
            itemClassName="col-span-1"
            className="grid gap-2 md:grid-cols-2"
          />
        </div>
      </div>
    </div>
  );
}

/* ─── Visualizations Tab ─── */
interface VisualizationsProps {
  profile: DatasetProfile;
  sessionId: string;
  rows: Record<string, unknown>[];
}

function Visualizations({ profile, sessionId, rows }: VisualizationsProps) {
  const [vizMode, setVizMode] = useState<"auto" | "custom">("auto");
  const [column1, setColumn1] = useState<string>(profile.columns[0]?.name || "");
  const [column2, setColumn2] = useState<string>("none");
  const [chartType, setChartType] = useState<string>("");
  const [chartData, setChartData] = useState<any[]>([]);
  const [chartKeys, setChartKeys] = useState<string[]>([]);
  const [insight, setInsight] = useState<string>("");
  const [correlation, setCorrelation] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runGetVisualization = useServerFn(getVisualization);
  const runExportVisualizationCode = useServerFn(exportVisualizationCode);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const isNumeric = (colName: string) => {
    const col = profile.columns.find((c) => c.name === colName);
    return col?.type === "numeric";
  };

  const isNumericOrDate = (colName: string) => {
    const col = profile.columns.find((c) => c.name === colName);
    return col?.type === "numeric" || col?.type === "datetime";
  };

  const isCategorical = (colName: string) => {
    const col = profile.columns.find((c) => c.name === colName);
    return col ? col.type !== "numeric" : false;
  };

  const isLowCardinalityCategorical = (colName: string) => {
    const col = profile.columns.find((c) => c.name === colName);
    if (!col) return false;
    return col.type !== "numeric" && col.unique <= 50;
  };

  const getValidChartTypes = (col1: string, col2: string) => {
    if (!col1) return [];

    const list: { id: string; label: string }[] = [];

    // Single Column
    if (col2 === "none") {
      if (isNumeric(col1)) {
        list.push({ id: "histogram", label: "Histogram (Distribution)" });
        list.push({ id: "kde", label: "Kernel Density Estimation (KDE)" });
        list.push({ id: "boxplot", label: "Box Plot (Summary)" });
        list.push({ id: "gauge", label: "Gauge Chart (KPI)" });
      } else {
        if (isLowCardinalityCategorical(col1)) {
          list.push({ id: "pie", label: "Pie Chart" });
          list.push({ id: "donut", label: "Donut Chart" });
        }
        list.push({ id: "treemap", label: "Treemap (Frequency)" });
        list.push({ id: "funnel", label: "Funnel Chart (Frequency)" });
      }
      return list;
    }

    // Two Columns
    const c1Numeric = isNumeric(col1);
    const c2Numeric = isNumeric(col2);
    const c1NumericOrDate = isNumericOrDate(col1);
    const c2NumericOrDate = isNumericOrDate(col2);

    if (c1Numeric && c2Numeric) {
      list.push({ id: "scatter", label: "Scatter Plot (Correlation)" });
      list.push({ id: "line", label: "Line Chart" });
    } else if ((c1NumericOrDate && c2Numeric) || (c2NumericOrDate && c1Numeric)) {
      list.push({ id: "line", label: "Line Chart" });
    }

    if (!c1Numeric && !c2Numeric) {
      list.push({ id: "grouped_bar", label: "Grouped Bar (Frequency)" });
      list.push({ id: "heatmap", label: "Heatmap (Crosstab)" });
    }

    const hasCategoricalAndNumeric = (isCategorical(col1) && c2Numeric) || (isCategorical(col2) && c1Numeric);
    if (hasCategoricalAndNumeric) {
      list.push({ id: "bar", label: "Bar Chart (Average)" });
      list.push({ id: "boxplot", label: "Box Plot (Grouped)" });
      list.push({ id: "waterfall", label: "Waterfall Chart" });
      list.push({ id: "treemap", label: "Treemap (Weighted)" });
    }

    return list;
  };

  const validChartTypes = useMemo(() => {
    return getValidChartTypes(column1, column2);
  }, [column1, column2]);

  // Automatically select first valid chart type when valid list changes
  useEffect(() => {
    if (validChartTypes.length > 0) {
      if (!validChartTypes.some((v) => v.id === chartType)) {
        setChartType(validChartTypes[0].id);
      }
    } else {
      setChartType("");
    }
  }, [validChartTypes, chartType]);

  const fetchVisualization = async () => {
    if (!column1 || !chartType) {
      setChartData([]);
      setInsight("");
      setCorrelation(null);
      setChartKeys([]);
      return;
    }

    // Guard: check if the selected chartType is actually valid for the current column types
    if (!validChartTypes.some((v) => v.id === chartType)) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let apiCol1 = column1;
      let apiCol2 = column2 === "none" ? null : column2;

      if (apiCol2) {
        const c1Numeric = isNumeric(column1);
        const c2Numeric = isNumeric(apiCol2);

        // Swap columns if necessary for backend grouping: col1 = categorical, col2 = numeric
        if (
          (chartType === "boxplot" ||
            chartType === "bar" ||
            chartType === "waterfall" ||
            chartType === "treemap") &&
          c1Numeric &&
          !c2Numeric
        ) {
          apiCol1 = apiCol2;
          apiCol2 = column1;
        } else if (chartType === "line" && c1Numeric && isNumericOrDate(apiCol2) && !isNumeric(apiCol2)) {
          apiCol1 = apiCol2;
          apiCol2 = column1;
        }
      }

      const result = await runGetVisualization({
        data: {
          session_id: sessionId,
          column1: apiCol1,
          column2: apiCol2 || undefined,
          chart_type: chartType,
        },
      });

      setChartData(result.data || []);
      setInsight(result.insight || "");
      setCorrelation(result.correlation !== undefined ? result.correlation : null);
      setChartKeys(result.keys || []);
    } catch (err: any) {
      console.error("Error fetching visualization:", err);
      setError(err.message || "Failed to generate visualization data.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadImage = async () => {
    if (!chartContainerRef.current) return;
    setLoading(true);
    try {
      const dataUrl = await toPng(chartContainerRef.current, { 
        backgroundColor: '#020617',
        style: {
          borderRadius: '0px'
        }
      });
      const link = document.createElement('a');
      link.download = `${chartType}_${column1}${column2 !== "none" ? '_' + column2 : ''}.png`;
      link.href = dataUrl;
      link.click();
      toast.success("Image exported successfully!");
    } catch (err) {
      console.error(err);
      toast.error('Failed to export image');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadCode = async () => {
    setLoading(true);
    try {
      let apiCol1 = column1;
      let apiCol2 = column2 === "none" ? null : column2;

      if (apiCol2) {
        const c1Numeric = isNumeric(column1);
        const c2Numeric = isNumeric(apiCol2);
        if (
          (chartType === "boxplot" ||
            chartType === "bar" ||
            chartType === "waterfall" ||
            chartType === "treemap") &&
          c1Numeric &&
          !c2Numeric
        ) {
          apiCol1 = apiCol2;
          apiCol2 = column1;
        } else if (chartType === "line" && c1Numeric && isNumericOrDate(apiCol2) && !isNumeric(apiCol2)) {
          apiCol1 = apiCol2;
          apiCol2 = column1;
        }
      }

      const result = await runExportVisualizationCode({
        data: {
          session_id: sessionId,
          column1: apiCol1,
          column2: apiCol2 || undefined,
          chart_type: chartType,
        },
      });

      if (!result.code) {
        throw new Error("No code returned from server");
      }

      const blob = new Blob([result.code], { type: 'text/x-python' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename || `${chartType}_${column1}.py`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Python code exported successfully!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to export code');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVisualization();
  }, [column1, column2, chartType, sessionId]);

  const sortedData = useMemo(() => {
    if (chartType === "scatter" && chartData.length > 0) {
      return [...chartData].sort((a, b) => {
        const valA = Number(a[column1]);
        const valB = Number(b[column1]);
        if (isNaN(valA) || isNaN(valB)) return 0;
        return valA - valB;
      });
    }
    return chartData;
  }, [chartData, chartType, column1]);

  const boxPlotData = useMemo(() => {
    if (chartType !== "boxplot") return [];
    return chartData.map((item) => {
      const minVal = item.min ?? 0;
      const q1Val = item.q1 ?? 0;
      const medianVal = item.median ?? 0;
      const q3Val = item.q3 ?? 0;
      const maxVal = item.max ?? 0;

      return {
        name: item.group || item.name || "Dataset",
        min: minVal,
        lowerWhisker: q1Val - minVal,
        lowerBox: medianVal - q1Val,
        upperBox: q3Val - medianVal,
        upperWhisker: maxVal - q3Val,
        origMin: minVal,
        origQ1: q1Val,
        origMedian: medianVal,
        origQ3: q3Val,
        origMax: maxVal,
      };
    });
  }, [chartData, chartType]);

  const heatmapInfo = useMemo(() => {
    if (chartType !== "heatmap" || chartData.length === 0) return null;

    const xKeys = Array.from(new Set(chartData.map((d) => d.x))).sort();
    const yKeys = Array.from(new Set(chartData.map((d) => d.y))).sort();
    const maxCount = Math.max(...chartData.map((d) => d.count), 1);

    const countMap: Record<string, number> = {};
    chartData.forEach((d) => {
      countMap[`${d.x}_${d.y}`] = d.count;
    });

    return { xKeys, yKeys, maxCount, countMap };
  }, [chartData, chartType]);

  const waterfallData = useMemo(() => {
    if (chartType !== "waterfall") return [];
    return chartData.map((item) => {
      const start = item.start ?? 0;
      const end = item.end ?? 0;
      const delta = item.delta ?? 0;
      const isIncrease = delta >= 0;
      return {
        name: item.name,
        base: isIncrease ? start : end,
        deltaValue: Math.abs(delta),
        rawDelta: delta,
        isIncrease,
      };
    });
  }, [chartData, chartType]);

  const renderChart = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center space-y-4">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <p className="text-xs text-muted-foreground font-mono">Computing aggregation and statistics...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center space-y-3 max-w-md text-center p-6">
          <AlertTriangle className="h-10 w-10 text-[color:var(--color-warning)] animate-pulse" />
          <p className="text-sm font-semibold text-foreground">Visualization Error</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{error}</p>
          <button
            onClick={fetchVisualization}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-3.5 py-2 text-xs font-semibold hover:border-primary hover:bg-primary/5 transition-all"
          >
            Retry Analysis
          </button>
        </div>
      );
    }

    if (!column1) {
      return (
        <p className="text-xs text-muted-foreground font-mono">Select a column to get started.</p>
      );
    }

    if (validChartTypes.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center max-w-sm text-center p-6 space-y-2">
          <p className="text-sm font-semibold text-foreground">No single-column visualization available</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Categorical columns cannot be plotted alone. Please select a second numeric/categorical column to compare, or choose a numeric Column 1.
          </p>
        </div>
      );
    }

    if (chartData.length === 0) {
      return (
        <p className="text-xs text-muted-foreground font-mono">No data returned from backend.</p>
      );
    }

    let chartElement: React.ReactElement | null = null;

    if (chartType === "scatter") {
      chartElement = (
        <ComposedChart data={sortedData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            type="number"
            dataKey={column1}
            name={column1}
            stroke="rgba(255,255,255,0.4)"
            fontSize={10}
            domain={['auto', 'auto']}
            tickLine={false}
          />
          <YAxis
            type="number"
            dataKey={column2}
            name={column2}
            stroke="rgba(255,255,255,0.4)"
            fontSize={10}
            domain={['auto', 'auto']}
            tickLine={false}
          />
          <RechartsTooltip
            cursor={{ strokeDasharray: '3 3' }}
            contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '8px' }}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Scatter name="Data Points" dataKey={column2} fill="var(--color-primary)" opacity={0.6} />
          {sortedData[0] && "trend" in sortedData[0] && (
            <Line
              name="Trend Line"
              dataKey="trend"
              stroke="var(--color-accent)"
              dot={false}
              activeDot={false}
              strokeWidth={2}
            />
          )}
        </ComposedChart>
      );
    } else if (chartType === "histogram") {
      chartElement = (
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="bin" stroke="rgba(255,255,255,0.4)" fontSize={10} tickLine={false} />
          <YAxis stroke="rgba(255,255,255,0.4)" fontSize={10} tickLine={false} />
          <RechartsTooltip
            contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '8px' }}
          />
          <Bar dataKey="count" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
        </BarChart>
      );
    } else if (chartType === "boxplot") {
      chartElement = (
        <BarChart data={boxPlotData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="name" stroke="rgba(255,255,255,0.4)" fontSize={10} tickLine={false} />
          <YAxis stroke="rgba(255,255,255,0.4)" fontSize={10} tickLine={false} />
          <RechartsTooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="rounded-lg border border-white/10 bg-[#15151F]/95 p-3 text-xs shadow-md backdrop-blur-md">
                    <p className="font-semibold text-primary mb-1.5">{data.name}</p>
                    <div className="space-y-1 font-mono text-[10px]">
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Max:</span>
                        <span className="text-foreground font-semibold">{data.origMax.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Q3 (75%):</span>
                        <span className="text-foreground font-semibold">{data.origQ3.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Median:</span>
                        <span className="text-foreground font-semibold">{data.origMedian.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Q1 (25%):</span>
                        <span className="text-foreground font-semibold">{data.origQ1.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-foreground font-semibold">{data.origMin.toFixed(2)}</span>
                        <span className="text-muted-foreground">Min:</span>
                      </div>
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />
          <Bar dataKey="min" stackId="box" fill="transparent" />
          <Bar dataKey="lowerWhisker" stackId="box" fill="transparent" stroke="rgba(255,255,255,0.3)" strokeDasharray="3 3" />
          <Bar dataKey="lowerBox" stackId="box" fill="rgba(6, 182, 212, 0.2)" stroke="var(--color-primary)" strokeWidth={1} />
          <Bar dataKey="upperBox" stackId="box" fill="rgba(6, 182, 212, 0.4)" stroke="var(--color-primary)" strokeWidth={1} />
          <Bar dataKey="upperWhisker" stackId="box" fill="transparent" stroke="rgba(255,255,255,0.3)" strokeDasharray="3 3" />
        </BarChart>
      );
    } else if (chartType === "kde") {
      chartElement = (
        <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <defs>
            <linearGradient id="kdeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.4} />
              <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="x"
            type="number"
            domain={['auto', 'auto']}
            stroke="rgba(255,255,255,0.4)"
            fontSize={10}
            tickLine={false}
            tickFormatter={(v) => Number(v).toFixed(2)}
          />
          <YAxis stroke="rgba(255,255,255,0.4)" fontSize={10} tickLine={false} />
          <RechartsTooltip
            contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '8px' }}
            labelFormatter={(label) => `Value: ${Number(label).toFixed(2)}`}
          />
          <Area type="monotone" dataKey="density" fill="url(#kdeGradient)" stroke="var(--color-primary)" strokeWidth={2} />
        </AreaChart>
      );
    } else if (chartType === "bar") {
      chartElement = (
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="category" stroke="rgba(255,255,255,0.4)" fontSize={10} tickLine={false} />
          <YAxis stroke="rgba(255,255,255,0.4)" fontSize={10} tickLine={false} />
          <RechartsTooltip
            contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '8px' }}
          />
          <Bar dataKey="value" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
        </BarChart>
      );
    } else if (chartType === "grouped_bar") {
      chartElement = (
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="name" stroke="rgba(255,255,255,0.4)" fontSize={10} tickLine={false} />
          <YAxis stroke="rgba(255,255,255,0.4)" fontSize={10} tickLine={false} />
          <RechartsTooltip
            contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '8px' }}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          {chartKeys.map((key, idx) => {
            const colors = [
              "var(--color-primary)",
              "var(--color-accent)",
              "#10b981",
              "#f59e0b",
              "#f43f5e",
              "#0ea5e9",
              "#84cc16",
            ];
            const color = colors[idx % colors.length];
            return <Bar key={key} dataKey={key} fill={color} radius={[4, 4, 0, 0]} />;
          })}
        </BarChart>
      );
    } else if (chartType === "heatmap" && heatmapInfo) {
      chartElement = (
        <div className="w-full h-full overflow-auto flex items-center justify-center p-4">
          <table className="border-collapse text-[10px] text-muted-foreground">
            <thead>
              <tr>
                {[
                  <th key="header-label" className="p-2 border border-border/40 font-mono text-[9px] uppercase tracking-wider text-right pr-4 bg-secondary/20">
                    {column2} \ {column1}
                  </th>,
                  ...heatmapInfo.xKeys.map((x) => (
                    <th key={x} className="p-2 border border-border/40 font-semibold text-center min-w-[70px] max-w-[120px] truncate bg-secondary/15">
                      {x}
                    </th>
                  ))
                ]}
              </tr>
            </thead>
            <tbody>
              {heatmapInfo.yKeys.map((y) => (
                <tr key={y}>
                  {[
                    <td key="row-label" className="p-2 border border-border/40 font-semibold text-right pr-4 bg-secondary/15 font-mono text-[9px] uppercase tracking-wider min-w-[80px]">
                      {y}
                    </td>,
                    ...heatmapInfo.xKeys.map((x) => {
                      const count = heatmapInfo.countMap[`${x}_${y}`] ?? 0;
                      const intensity = count / heatmapInfo.maxCount;
                      const bgColor = `rgba(6, 182, 212, ${0.05 + intensity * 0.75})`;
                      const textColor = intensity > 0.4 ? "text-slate-950 font-bold" : "text-foreground";

                      return (
                        <td
                          key={x}
                          style={{ backgroundColor: bgColor }}
                          className={`p-3 border border-border/40 text-center transition-all hover:scale-105 hover:shadow-lg ${textColor}`}
                          title={`${column1}: ${x}\n${column2}: ${y}\nCount: ${count}`}
                        >
                          <span className="font-mono text-xs font-semibold">{count}</span>
                        </td>
                      );
                    })
                  ]}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    } else if (chartType === "line") {
      const c1Numeric = isNumeric(column1);

      let displayX = column1;
      let displayY = column2 !== "none" ? column2 : "";
      
      if (column2 !== "none" && c1Numeric && isNumericOrDate(column2) && !isNumeric(column2)) {
        displayX = column2;
        displayY = column1;
      }

      chartElement = (
        <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey={displayX}
            stroke="rgba(255,255,255,0.4)"
            fontSize={10}
            tickLine={false}
          />
          <YAxis stroke="rgba(255,255,255,0.4)" fontSize={10} tickLine={false} />
          <RechartsTooltip
            contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '8px' }}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Line type="monotone" dataKey={displayY} stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
        </LineChart>
      );
    } else if (chartType === "pie" || chartType === "donut") {
      const colors = [
        "var(--color-primary)",
        "var(--color-accent)",
        "#10b981",
        "#f59e0b",
        "#f43f5e",
        "#0ea5e9",
        "#84cc16",
        "#a855f7",
      ];
      chartElement = (
        <PieChart margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={chartType === "donut" ? 60 : 0}
            outerRadius={90}
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
            label={({ name, pct }) => `${name} (${pct}%)`}
          >
            {chartData.map((entry, idx) => (
              <Cell key={`cell-${idx}`} fill={colors[idx % colors.length]} />
            ))}
          </Pie>
          <RechartsTooltip
            contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '8px' }}
            formatter={(val, name, props: any) => [`${val} (${props.payload.pct}%)`, name]}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} />
        </PieChart>
      );
    } else if (chartType === "treemap") {
      chartElement = (
        <Treemap
          data={chartData}
          dataKey="value"
          nameKey="name"
          stroke="#fff"
          fill="var(--color-primary)"
        >
          <RechartsTooltip
            contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '8px' }}
          />
        </Treemap>
      );
    } else if (chartType === "funnel") {
      const colors = [
        "var(--color-primary)",
        "var(--color-accent)",
        "#10b981",
        "#f59e0b",
        "#f43f5e",
        "#0ea5e9",
        "#84cc16",
        "#a855f7",
      ];
      chartElement = (
        <FunnelChart margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <RechartsTooltip
            contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '8px' }}
          />
          <Funnel
            dataKey="value"
            data={chartData}
            isAnimationActive
          >
            <LabelList position="right" dataKey="stage" fill="rgba(255,255,255,0.6)" stroke="none" fontSize={10} />
            {chartData.map((entry, idx) => (
              <Cell key={`cell-${idx}`} fill={colors[idx % colors.length]} />
            ))}
          </Funnel>
        </FunnelChart>
      );
    } else if (chartType === "waterfall") {
      chartElement = (
        <BarChart data={waterfallData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="name" stroke="rgba(255,255,255,0.4)" fontSize={10} tickLine={false} />
          <YAxis stroke="rgba(255,255,255,0.4)" fontSize={10} tickLine={false} />
          <RechartsTooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="rounded-lg border border-white/10 bg-[#15151F]/95 p-3 text-xs shadow-md backdrop-blur-md">
                    <p className="font-semibold text-primary mb-1.5">{data.name}</p>
                    <div className="space-y-1 font-mono text-[10px]">
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Delta:</span>
                        <span className={`font-semibold ${data.isIncrease ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {data.rawDelta >= 0 ? "+" : ""}{data.rawDelta.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Value:</span>
                        <span className="text-foreground font-semibold">
                          {(data.base + (data.isIncrease ? data.deltaValue : 0)).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />
          <Bar dataKey="base" stackId="waterfall" fill="transparent" />
          <Bar dataKey="deltaValue" stackId="waterfall">
            {waterfallData.map((entry, idx) => (
              <Cell
                key={`cell-${idx}`}
                fill={entry.isIncrease ? "rgba(16, 185, 129, 0.75)" : "rgba(244, 63, 94, 0.75)"}
                stroke={entry.isIncrease ? "var(--color-success, #10b981)" : "var(--color-warning, #f43f5e)"}
                strokeWidth={1}
              />
            ))}
          </Bar>
        </BarChart>
      );
    } else if (chartType === "gauge") {
      const val = chartData[0]?.value ?? 0;
      const min = chartData[0]?.min ?? 0;
      const max = chartData[0]?.max ?? 100;
      const range = max - min;
      const pct = range > 0 ? Math.min(Math.max((val - min) / range, 0), 1) : 0.5;

      chartElement = (
        <div className="flex flex-col items-center justify-center w-full h-full max-w-[320px] mx-auto p-4 select-none">
          <svg viewBox="0 0 200 120" className="w-full h-full">
            <defs>
              <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="var(--color-primary, #0ea5e9)" />
                <stop offset="100%" stopColor="var(--color-accent, #10b981)" />
              </linearGradient>
            </defs>
            <path
              d="M 30,90 A 70,70 0 0,1 170,90"
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="12"
              strokeLinecap="round"
            />
            <path
              d="M 30,90 A 70,70 0 0,1 170,90"
              fill="none"
              stroke="url(#gaugeGrad)"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray="220"
              strokeDashoffset={220 - (220 * pct)}
              className="transition-all duration-1000 ease-out"
            />
            <text x="30" y="110" fill="rgba(255,255,255,0.4)" fontSize="8" textAnchor="middle" fontFamily="monospace">
              {min.toFixed(2)}
            </text>
            <text x="170" y="110" fill="rgba(255,255,255,0.4)" fontSize="8" textAnchor="middle" fontFamily="monospace">
              {max.toFixed(2)}
            </text>
            <text x="100" y="80" fill="white" fontSize="18" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
              {val.toFixed(2)}
            </text>
            <text x="100" y="98" fill="rgba(255,255,255,0.5)" fontSize="8" textAnchor="middle" fontFamily="sans-serif">
              Average Value
            </text>
          </svg>
        </div>
      );
    }

    if (!chartElement) return null;

    if (chartType === "heatmap" || chartType === "gauge") {
      return chartElement;
    }

    return (
      <ResponsiveContainer width="100%" height="100%">
        {chartElement}
      </ResponsiveContainer>
    );
  };

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <div className="flex rounded-lg bg-secondary/50 p-0.5 border border-border w-fit">
        <button
          onClick={() => setVizMode("auto")}
          className={`rounded-md px-3 py-1 text-[10px] font-medium transition-colors cursor-pointer ${
            vizMode === "auto"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Auto Charts
        </button>
        <button
          onClick={() => setVizMode("custom")}
          className={`rounded-md px-3 py-1 text-[10px] font-medium transition-colors cursor-pointer ${
            vizMode === "custom"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Custom Builder
        </button>
      </div>

      {vizMode === "auto" ? (
        <AutoCharts profile={profile} rows={rows} />
      ) : (
        <>
          {/* Selector controls card */}
          <div className="surface-card p-5">
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1 w-full space-y-1.5">
                <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Column 1</label>
                <select
                  value={column1}
                  onChange={(e) => setColumn1(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-xs backdrop-blur-sm transition-colors focus:border-primary focus:outline-none"
                >
                  {profile.columns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex-1 w-full space-y-1.5">
                <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Column 2 (Optional)</label>
                <select
                  value={column2}
                  onChange={(e) => setColumn2(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-xs backdrop-blur-sm transition-colors focus:border-primary focus:outline-none"
                >
                  {[
                    <option key="none-option" value="none">None (Single Column)</option>,
                    ...profile.columns.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name} ({c.type})
                      </option>
                    ))
                  ]}
                </select>
              </div>

              <div className="flex-1 w-full space-y-1.5">
                <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Chart Type</label>
                <select
                  value={chartType}
                  onChange={(e) => setChartType(e.target.value)}
                  disabled={validChartTypes.length === 0}
                  className="w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-xs backdrop-blur-sm transition-colors focus:border-primary focus:outline-none disabled:opacity-40"
                >
                  {validChartTypes.length === 0 ? (
                    <option value="">Invalid column combo</option>
                  ) : (
                    validChartTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>
          </div>

          {chartType === 'funnel' && (
            <div className="bg-amber-500/5 border border-amber-500/20 text-amber-400 rounded-lg p-3 text-xs flex items-start gap-2">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                ⚠️ Approximated from category frequency — not a true sequential funnel unless your data has explicit stage ordering.
              </p>
            </div>
          )}

          {/* Chart Display Area with Toolbar */}
          <div className="space-y-3">
            <div className="flex justify-between items-center px-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                Visualization View
              </span>
              <div className="flex gap-2">
                <button
                  onClick={handleDownloadImage}
                  disabled={loading || !column1}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background/60 hover:bg-secondary/80 px-3 py-1.5 text-xs transition-colors cursor-pointer text-foreground disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Download className="h-3.5 w-3.5" /> Download Image
                </button>
                <button
                  onClick={handleDownloadCode}
                  disabled={loading || !column1}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background/60 hover:bg-secondary/80 px-3 py-1.5 text-xs transition-colors cursor-pointer text-foreground disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Code className="h-3.5 w-3.5" /> Download Code
                </button>
              </div>
            </div>

            <div 
              ref={chartContainerRef}
              className="surface-card p-6 h-[450px] flex items-center justify-center relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-grid opacity-5 pointer-events-none" />
              {renderChart()}
            </div>
          </div>

          {/* Analytical Insights Card */}
          {insight && !loading && !error && (
            <div className="surface-card relative overflow-hidden p-5">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-accent/5 pointer-events-none" />
              <div className="relative flex flex-col md:flex-row md:items-start gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
                  <Lightbulb className="h-4.5 w-4.5 text-primary" />
                </div>
                <div className="space-y-1.5">
                  <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Analytical Insights</h4>
                  <p className="text-sm leading-relaxed text-foreground">{insight}</p>
                  {correlation !== null && (
                    <div className="inline-flex items-center gap-1.5 mt-1 rounded-full bg-accent/10 border border-accent/20 px-2.5 py-0.5 text-xs text-accent">
                      <Activity className="h-3 w-3" />
                      <span>Correlation Coefficient: <strong className="font-mono">{correlation.toFixed(3)}</strong></span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Report Tab ─── */
function ReportTab({
  profile, fileName, insights, narrative, story, runStory, aiBusy, analysis,
}: {
  profile: DatasetProfile; fileName: string; insights: { text: string; why?: string; confidence: number; tag: string }[];
  narrative: string; story: string; runStory: () => void; aiBusy: boolean; analysis: AnalysisResult | null;
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
            onClick={() => exportReportPDF({ profile, fileName, insights, story, narrative, analysis })}
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
