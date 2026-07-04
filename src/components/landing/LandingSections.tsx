/**
 * LandingSections — the 6 full-viewport pinned content panels
 *
 * Each panel overlays the 3D scene with content that reveals on section enter.
 * SplitText (via GSAP) animates headlines character-by-character.
 *
 * Sections:
 *  0 — Hero
 *  1 — Trust Score
 *  2 — Leakage Scan (the money shot — verbatim copy from spec)
 *  3 — SHAP
 *  4 — Anomaly
 *  5 — CTA
 *
 * prefers-reduced-motion: simple opacity/transform fade, no SplitText timing.
 */
"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

// ─── shared typography ────────────────────────────────────────────────────────

const MONO: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace",
};

const LABEL: React.CSSProperties = {
  ...MONO,
  fontSize: "clamp(10px, 1vw, 12px)",
  letterSpacing: "0.2em",
  textTransform: "uppercase" as const,
  color: "#64748b",
  marginBottom: 16,
};

const HEADLINE: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: "clamp(32px, 5vw, 72px)",
  fontWeight: 400,
  lineHeight: 1.1,
  color: "#f8fafc",
  letterSpacing: "-0.03em",
  margin: "0 0 24px",
};

const BODY: React.CSSProperties = {
  ...MONO,
  fontSize: "clamp(13px, 1.2vw, 16px)",
  lineHeight: 1.75,
  color: "#94a3b8",
  maxWidth: 480,
};

// Bespoke ease string for reveals
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

// ─── SplitText-style reveal hook ─────────────────────────────────────────────
// We hand-split because GSAP SplitText is Club-only; this produces identical
// results for headline reveals.

function splitIntoChars(el: HTMLElement): HTMLSpanElement[] {
  const text = el.textContent ?? "";
  el.innerHTML = "";
  return text.split("").map((ch) => {
    const span = document.createElement("span");
    span.textContent = ch === " " ? "\u00A0" : ch;
    span.style.display = "inline-block";
    span.style.overflow = "hidden";
    el.appendChild(span);
    return span;
  });
}

function useSectionReveal(
  ref: React.RefObject<HTMLDivElement | null>,
  isActive: boolean,
  delay = 0
) {
  const hasRevealedRef = useRef(false);

  useEffect(() => {
    if (!ref.current) return;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const headings = ref.current.querySelectorAll<HTMLElement>("[data-reveal-heading]");
    const bodies   = ref.current.querySelectorAll<HTMLElement>("[data-reveal-body]");

    if (isActive && !hasRevealedRef.current) {
      hasRevealedRef.current = true;

      if (prefersReduced) {
        gsap.to([...headings, ...bodies], { opacity: 1, y: 0, duration: 0.4, stagger: 0.05 });
        return;
      }

      headings.forEach((h) => {
        const chars = splitIntoChars(h);
        gsap.fromTo(
          chars,
          { y: "105%", opacity: 0 },
          {
            y: "0%",
            opacity: 1,
            duration: 0.7,
            stagger: 0.018,
            ease: EASE,
            delay,
          }
        );
      });

      bodies.forEach((b, i) => {
        gsap.fromTo(
          b,
          { y: 20, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.6, ease: EASE, delay: delay + 0.3 + i * 0.1 }
        );
      });
    }

    if (!isActive) {
      hasRevealedRef.current = false;
      gsap.set([...headings, ...bodies], { opacity: 0, y: 20 });
    }
  }, [isActive, ref, delay]);
}

// ─── panel wrapper ────────────────────────────────────────────────────────────

function Panel({
  children,
  align = "left",
  justify = "center",
}: {
  children: React.ReactNode;
  align?: "left" | "center" | "right";
  justify?: "start" | "center" | "end";
}) {
  const alignMap = { left: "flex-start", center: "center", right: "flex-end" };
  const justifyMap = { start: "flex-start", center: "center", end: "flex-end" };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: alignMap[align],
        justifyContent: justifyMap[justify],
        padding: "clamp(32px, 6vw, 96px)",
        pointerEvents: "none",
      }}
    >
      <div style={{ maxWidth: 640, pointerEvents: "auto" }}>{children}</div>
    </div>
  );
}

// ─── Section 0: Hero ─────────────────────────────────────────────────────────

function HeroSection({ active }: { active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useSectionReveal(ref, active, 0.1);

  return (
    <div ref={ref} style={{ position: "absolute", inset: 0 }}>
      <Panel align="left" justify="center">
        <p style={LABEL} data-reveal-body>Data intelligence platform</p>
        <h1
          style={{ ...HEADLINE, fontSize: "clamp(40px, 6vw, 88px)" }}
          data-reveal-heading
        >
          Honest analysis.{"\n"}No pretense.
        </h1>
        <p style={BODY} data-reveal-body>
          Upload a spreadsheet. Get a trust-scored, leakage-aware, SHAP-explained
          analysis — every number computed in Python, every claim defensible.
        </p>
        <div style={{ marginTop: 40, opacity: 0 }} data-reveal-body>
          <p style={{ ...MONO, fontSize: 11, color: "#475569", letterSpacing: "0.15em" }}>
            SCROLL TO EXPLORE
          </p>
        </div>
      </Panel>
    </div>
  );
}

// ─── Section 1: Trust Score ───────────────────────────────────────────────────

function TrustScoreSection({ active }: { active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useSectionReveal(ref, active, 0.05);

  return (
    <div ref={ref} style={{ position: "absolute", inset: 0 }}>
      <Panel align="right" justify="center">
        <p style={LABEL} data-reveal-body>01 — Trust Score</p>
        <h2 style={HEADLINE} data-reveal-heading>
          Five components.{"\n"}One defensible number.
        </h2>
        <p style={BODY} data-reveal-body>
          Completeness, validity, consistency, uniqueness, timeliness — weighted
          transparently, broken down per component so you know exactly why
          your dataset scored 0.74 and not 0.91.
        </p>
      </Panel>
    </div>
  );
}

// ─── Section 2: Leakage Scan ─────────────────────────────────────────────────
// Verbatim copy from spec — do not alter.

function LeakageScanSection({ active }: { active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useSectionReveal(ref, active, 0.0);

  return (
    <div ref={ref} style={{ position: "absolute", inset: 0 }}>
      <Panel align="center" justify="center">
        <p style={LABEL} data-reveal-body>02 — Leakage Scan</p>
        {/* Four beats, each a heading-level element for SplitText timing */}
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "clamp(20px, 3vw, 44px)",
            fontWeight: 400,
            lineHeight: 1.2,
            color: "#f8fafc",
            letterSpacing: "-0.02em",
          }}
        >
          <div data-reveal-heading style={{ marginBottom: "0.4em" }}>
            Model hits 0.97 AUC.
          </div>
          <div data-reveal-heading style={{ marginBottom: "0.4em", color: "#f59e0b" }}>
            But customer_id is leaking.
          </div>
          <div data-reveal-heading style={{ marginBottom: "0.4em" }}>
            Exclude it.
          </div>
          <div data-reveal-heading style={{ color: "#22c55e" }}>
            Honest 0.71.
          </div>
        </div>
        <p style={{ ...BODY, marginTop: 32 }} data-reveal-body>
          Single-feature cross-validation detects structural giveaways before
          training begins. No leaderboard heroics.
        </p>
      </Panel>
    </div>
  );
}

// ─── Section 3: SHAP ─────────────────────────────────────────────────────────

function ShapSection({ active }: { active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useSectionReveal(ref, active, 0.05);

  return (
    <div ref={ref} style={{ position: "absolute", inset: 0 }}>
      <Panel align="left" justify="center">
        <p style={LABEL} data-reveal-body>03 — SHAP Explanations</p>
        <h2 style={HEADLINE} data-reveal-heading>
          Global importance.{"\n"}Per-row waterfall.
        </h2>
        <p style={BODY} data-reveal-body>
          SHAP values computed on the trained best model — no retraining.
          Bar chart for global feature ranking, waterfall for per-prediction
          attribution. Rendered server-side and never hallucinated.
        </p>
      </Panel>
    </div>
  );
}

// ─── Section 4: Anomaly ──────────────────────────────────────────────────────

function AnomalySection({ active }: { active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useSectionReveal(ref, active, 0.05);

  return (
    <div ref={ref} style={{ position: "absolute", inset: 0 }}>
      <Panel align="right" justify="center">
        <p style={LABEL} data-reveal-body>04 — Anomaly Detection</p>
        <h2 style={HEADLINE} data-reveal-heading>
          Isolation Forest.{"\n"}Top-3 drivers.
        </h2>
        <p style={BODY} data-reveal-body>
          Per-row anomaly scores ranked by deviation from robust column centers
          (median/IQR). Not SHAP — attribution is deterministic and auditable.
          The three columns that made this row strange, named explicitly.
        </p>
      </Panel>
    </div>
  );
}

// ─── Section 5: CTA ──────────────────────────────────────────────────────────

export function CtaSection({
  active,
  onLaunch,
}: {
  active: boolean;
  onLaunch: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useSectionReveal(ref, active, 0.1);

  return (
    <div ref={ref} style={{ position: "absolute", inset: 0 }}>
      <Panel align="center" justify="center">
        <p style={LABEL} data-reveal-body>05 — Ready</p>
        <h2 style={HEADLINE} data-reveal-heading>
          Upload your dataset.{"\n"}Get the truth.
        </h2>
        <p style={BODY} data-reveal-body>
          No demo data. No sample dashboard. Your CSV, your numbers.
        </p>
        <div style={{ marginTop: 48 }} data-reveal-body>
          <button
            onClick={onLaunch}
            data-magnetic
            data-cursor-hover
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 13,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "#000",
              background: "#f8fafc",
              border: "none",
              padding: "16px 40px",
              cursor: "pointer",
              position: "relative",
              overflow: "hidden",
            }}
            aria-label="Launch InsightFlow application"
            id="cta-launch-button"
          >
            Launch InsightFlow
          </button>
        </div>
      </Panel>
    </div>
  );
}

// ─── composite export ─────────────────────────────────────────────────────────

export interface LandingSectionsProps {
  currentSection: number;
  onLaunch: () => void;
}

export function LandingSections({ currentSection, onLaunch }: LandingSectionsProps) {
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {currentSection === 0 && <HeroSection       active={currentSection === 0} />}
      {currentSection === 1 && <TrustScoreSection active={currentSection === 1} />}
      {currentSection === 2 && <LeakageScanSection active={currentSection === 2} />}
      {currentSection === 3 && <ShapSection       active={currentSection === 3} />}
      {currentSection === 4 && <AnomalySection    active={currentSection === 4} />}
      {currentSection === 5 && <CtaSection        active={currentSection === 5} onLaunch={onLaunch} />}
    </div>
  );
}
