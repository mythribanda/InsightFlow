/**
 * src/routes/index.tsx  →  path: "/"
 *
 * Routing logic at the root:
 *   • Unauthenticated visitor  → renders the 3D landing page (LandingPage)
 *   • Authenticated user       → immediately redirects to /app (the dashboard)
 *     so they never see the marketing page on repeat logins.
 *
 * Auth check is intentionally kept client-side (useEffect + useAuth) because:
 *   1. The landing page is already ssr:false (R3F/WebGL cannot run in Node).
 *   2. Supabase session is not available server-side without cookie forwarding,
 *      which is not configured in this project.
 *   3. The preloader covers the hydration gap — there is no flash of wrong content.
 */
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, Suspense, lazy, useState, useCallback } from "react";
import { ErrorComponent } from "./__root";
import { Canvas } from "@react-three/fiber";
import { useAuth } from "@/contexts/AuthContext";
import { Brain, Sun, Moon } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { CinematicPreloader }  from "../components/landing/CinematicPreloader";
import { GrainOverlay }        from "../components/landing/GrainOverlay";
import { CustomCursor }        from "../components/landing/CustomCursor";
import { SideProgress }        from "../components/landing/SideProgress";
import { AmbientAudio }        from "../components/landing/AmbientAudio";
import { RouteTransition }     from "../components/landing/RouteTransition";
import { useScrollJack, SECTION_COUNT } from "../hooks/useScrollJack";

// ─── Navbar Component ────────────────────────────────────────────────────────

function Navbar({
  currentSection,
  onJump,
  onLaunch,
}: {
  currentSection: number;
  onJump: (index: number) => void;
  onLaunch: () => void;
}) {
  const { theme, toggleTheme } = useTheme();
  const sections = [
    { label: "Home", index: 0 },
    { label: "Trust Score", index: 1 },
    { label: "Leakage Scan", index: 2 },
    { label: "SHAP", index: 3 },
    { label: "Anomaly", index: 4 },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-30 transition-all duration-300 bg-[#0A0A0F]/60 backdrop-blur-md border-b border-white/5 py-4 px-6 sm:px-12 flex items-center justify-between">
      {/* Logo */}
      <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => onJump(0)}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-[#8B5CF6] to-[#A855F7] shadow-[0_0_15px_rgba(139,92,246,0.3)]">
          <Brain className="w-4.5 h-4.5 text-white" />
        </div>
        <span className="font-bold text-base text-white tracking-tight">
          Insight<span className="bg-gradient-to-r from-[#8B5CF6] to-[#A855F7] bg-clip-text text-transparent">Flow</span>
        </span>
      </div>

      {/* Nav Links */}
      <nav className="hidden md:flex items-center gap-6">
        {sections.map((s) => (
          <button
            key={s.index}
            onClick={() => onJump(s.index)}
            className={`font-mono text-xs uppercase tracking-wider transition-colors cursor-pointer ${
              currentSection === s.index
                ? "text-[#8B5CF6] font-bold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleTheme}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all text-slate-300 hover:text-white cursor-pointer shrink-0"
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <Link
          to="/login"
          className="rounded-full px-4 py-1.5 border border-white/10 hover:border-white/20 text-xs font-mono font-medium text-slate-300 hover:text-white transition-all bg-white/5"
        >
          Login
        </Link>
        <Link
          to="/signup"
          className="hidden sm:inline-block rounded-full px-4 py-1.5 border border-transparent hover:border-white/10 text-xs font-mono font-medium text-slate-300 hover:text-white transition-all"
        >
          Register
        </Link>
        <button
          onClick={onLaunch}
          className="rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#A855F7] hover:from-[#7c3aed] hover:to-[#9333ea] px-5 py-1.5 text-xs font-mono font-bold text-white shadow-[0_0_15px_rgba(139,92,246,0.2)] hover:shadow-[0_0_20px_rgba(139,92,246,0.4)] transition-all cursor-pointer"
        >
          Launch App
        </button>
      </div>
    </header>
  );
}

const DependencyGraph3D = lazy(() =>
  import("../components/landing/DependencyGraph3D").then((m) => ({
    default: m.DependencyGraph3D,
  }))
);
const LandingSections = lazy(() =>
  import("../components/landing/LandingSections").then((m) => ({
    default: m.LandingSections,
  }))
);

export const Route = createFileRoute("/")({
  // R3F uses WebGL — client-only components are gated/deferred to prevent SSR issues.
  component: RootGate,
  errorComponent: ErrorComponent,
});

// ─── Auth gate ────────────────────────────────────────────────────────────────
// Renders nothing (null) while auth is loading, then either redirects to /app
// (authenticated) or renders the landing page (unauthenticated).

function RootGate() {
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (authLoading) return;
    if (session) {
      // Authenticated: skip landing, go straight to the app.
      navigate({ to: "/app", replace: true });
    }
    // Unauthenticated: fall through to render LandingPage below.
  }, [session, authLoading, navigate]);

  // While auth resolves, show nothing (preloader covers this).
  if (authLoading) return null;
  // Authenticated: redirect is in flight, render nothing to avoid flash.
  if (session) return null;

  return <LandingPage />;
}

// ─── Vignette ────────────────────────────────────────────────────────────────

function Vignette() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        background:
          "radial-gradient(ellipse at 50% 50%, transparent 45%, rgba(0,0,0,0.55) 100%)",
        zIndex: 2,
      }}
    />
  );
}

// ─── 3D Canvas ───────────────────────────────────────────────────────────────

function LandingCanvas({
  scrollProgress,
  preloaderDone,
}: {
  scrollProgress: number;
  preloaderDone: boolean;
}) {
  if (!preloaderDone) return null;
  return (
    <Canvas
      camera={{ position: [0, 0, 18], fov: 60 }}
      style={{ position: "absolute", inset: 0, background: "var(--background)" }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      dpr={[1, Math.min(window.devicePixelRatio, 2)]}
      frameloop="always"
    >
      <Suspense fallback={null}>
        <DependencyGraph3D scrollProgress={scrollProgress} />
      </Suspense>
    </Canvas>
  );
}

// ─── Reduced-motion fallback ─────────────────────────────────────────────────

function ReducedMotionSections({ onLaunch }: { onLaunch: () => void }) {
  const sections = [
    {
      label: "Data intelligence platform",
      headline: "Honest analysis.\nNo pretense.",
      body: "Upload a spreadsheet. Get a trust-scored, leakage-aware, SHAP-explained analysis.",
    },
    {
      label: "01 — Trust Score",
      headline: "Five components.\nOne defensible number.",
      body: "Completeness, validity, consistency, uniqueness, timeliness — weighted transparently.",
    },
    {
      label: "02 — Leakage Scan",
      headline: "Model hits 0.97 AUC.\nBut customer_id is leaking.\nExclude it.\nHonest 0.71.",
      body: "Single-feature cross-validation detects structural giveaways before training begins.",
    },
    {
      label: "03 — SHAP",
      headline: "Global importance.\nPer-row waterfall.",
      body: "SHAP values on the trained model — no retraining, no hallucination.",
    },
    {
      label: "04 — Anomaly",
      headline: "Isolation Forest.\nTop-3 drivers.",
      body: "Per-row anomaly scores attributed by deviation from robust column centers.",
    },
  ];

  return (
    <div style={{ overflowY: "auto" }}>
      {sections.map((s, i) => (
        <section
          key={i}
          style={{
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "clamp(32px, 6vw, 96px)",
            background: i % 2 === 0 ? "#0A0A0F" : "#15151F",
          }}
        >
          <p style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: 16 }}>
            {s.label}
          </p>
          <h2 style={{ fontFamily: "monospace", fontSize: "clamp(28px, 4vw, 56px)", fontWeight: 400, color: "var(--foreground)", whiteSpace: "pre-line", margin: "0 0 24px" }}>
            {s.headline}
          </h2>
          <p style={{ fontFamily: "monospace", fontSize: "clamp(13px, 1.2vw, 16px)", color: "var(--muted-foreground)", maxWidth: 480, lineHeight: 1.75 }}>
            {s.body}
          </p>
        </section>
      ))}
      <section
        style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0A0A0F", padding: 32 }}
      >
        <h2 style={{ fontFamily: "monospace", fontSize: "clamp(28px, 4vw, 56px)", color: "var(--foreground)", textAlign: "center", margin: "0 0 40px", whiteSpace: "pre-line" }}>
          Upload your dataset.{"\n"}Get the truth.
        </h2>
        <button
          onClick={onLaunch}
          style={{ fontFamily: "monospace", fontSize: 13, letterSpacing: "0.15em", textTransform: "uppercase", color: "#000", background: "var(--foreground)", border: "none", padding: "16px 40px", cursor: "pointer" }}
        >
          Launch InsightFlow
        </button>
      </section>
    </div>
  );
}

// ─── Landing page (unauthenticated experience) ────────────────────────────────

function LandingPage() {
  const navigate = useNavigate();
  const [preloaderDone, setPreloaderDone]  = useState(false);
  const [ctaTriggered,  setCtaTriggered]   = useState(false);
  const [reducedMotion, setReducedMotion]  = useState(false);

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const { scrollProgress, currentSection, goToSection } = useScrollJack();

  const handlePreloaderComplete = useCallback(() => setPreloaderDone(true), []);

  // CTA "Launch InsightFlow": go to /login for unauthenticated visitors.
  const handleLaunch = useCallback(() => setCtaTriggered(true), []);

  // After the clip-path transition completes, navigate to /login.
  const handleTransitionComplete = useCallback(() => {
    navigate({ to: "/login" });
  }, [navigate]);

  // ── reduced-motion path ──────────────────────────────────────────────────
  if (reducedMotion) {
    return (
      <>
        <ReducedMotionSections onLaunch={handleLaunch} />
        <RouteTransition triggered={ctaTriggered} onComplete={handleTransitionComplete} />
      </>
    );
  }

  // ── full 3D experience ───────────────────────────────────────────────────
  return (
    <>
      <div
        style={{ position: "fixed", inset: 0, overflow: "hidden", background: "var(--background)" }}
        aria-label="InsightFlow landing page"
      >
        <LandingCanvas scrollProgress={scrollProgress} preloaderDone={preloaderDone} />
        {preloaderDone && <Vignette />}
        {preloaderDone && <Navbar currentSection={currentSection} onJump={goToSection} onLaunch={handleLaunch} />}
        {preloaderDone && (
          <Suspense fallback={null}>
            <LandingSections currentSection={currentSection} onLaunch={handleLaunch} />
          </Suspense>
        )}
        {preloaderDone && <GrainOverlay />}
        {preloaderDone && (
          <SideProgress currentSection={currentSection} total={SECTION_COUNT} onJump={goToSection} />
        )}
      </div>

      <CinematicPreloader onComplete={handlePreloaderComplete} />
      <CustomCursor />
      {preloaderDone && <AmbientAudio />}
      <RouteTransition triggered={ctaTriggered} onComplete={handleTransitionComplete} />
    </>
  );
}
