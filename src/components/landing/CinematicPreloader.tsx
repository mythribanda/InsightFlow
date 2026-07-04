/**
 * CinematicPreloader
 *
 * Full-screen black canvas with:
 * - Real percentage counter (tied to useProgress from drei) in IBM Plex Mono
 * - Wireframe pass of the dependency graph assembling itself (nodes fade in
 *   one-at-a-time, edges draw with animated stroke-dashoffset)
 * - On 100%: clip-path wipe reveal, scene snaps to sharp detail
 * - sessionStorage flag: full preloader once per session, 400 ms fast version
 *   on repeat visits
 *
 * Props:
 *   onComplete()  — called when exit animation finishes
 */
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { useProgress } from "@react-three/drei";
import { gsap } from "gsap";
import { DependencyGraph3D } from "./DependencyGraph3D";

const SESSION_KEY = "insightflow_preloader_seen";
const FAST_DURATION = 450; // ms

// ─── WireframePass: the low-detail graph assembling itself ────────────────────

function WireframePass({ progress }: { progress: number }) {
  const TOTAL_NODES = 10;
  const visibleNodeCount = Math.ceil(progress * TOTAL_NODES);
  const edgeProgress = Math.max(0, (progress - 0.6) / 0.4); // edges start drawing at 60%

  return (
    <Canvas
      camera={{ position: [0, 0, 18], fov: 60 }}
      style={{ position: "absolute", inset: 0, background: "transparent" }}
      gl={{ alpha: true, antialias: false }}
      dpr={[1, 1.5]}
    >
      <DependencyGraph3D
        scrollProgress={0}
        isWireframe={true}
        visibleNodeCount={visibleNodeCount}
        edgeProgress={edgeProgress}
      />
    </Canvas>
  );
}

// ─── counter ─────────────────────────────────────────────────────────────────

function Counter({ value }: { value: number }) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: "10%",
        left: "50%",
        transform: "translateX(-50%)",
        fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace",
        fontSize: "clamp(48px, 8vw, 96px)",
        fontWeight: 400,
        color: "#f8fafc",
        letterSpacing: "-0.02em",
        lineHeight: 1,
        userSelect: "none",
        zIndex: 10,
      }}
      aria-live="polite"
      aria-label={`Loading ${value} percent`}
    >
      {String(value).padStart(3, "0")}
      <span style={{ fontSize: "0.35em", opacity: 0.5, marginLeft: 4 }}>%</span>
    </div>
  );
}

// ─── wordmark ─────────────────────────────────────────────────────────────────

function Wordmark() {
  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: "clamp(13px, 1.5vw, 18px)",
        fontWeight: 500,
        color: "#94a3b8",
        letterSpacing: "0.25em",
        textTransform: "uppercase",
        userSelect: "none",
        zIndex: 10,
      }}
    >
      InsightFlow
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

interface Props {
  onComplete: () => void;
}

export function CinematicPreloader({ onComplete }: Props) {
  const wrapperRef  = useRef<HTMLDivElement>(null);
  const overlayRef  = useRef<HTMLDivElement>(null);
  const [displayPct, setDisplayPct] = useState(0);
  const [graphProgress, setGraphProgress] = useState(0);
  const [done, setDone] = useState(false);
  const hasFiredRef = useRef(false);

  // drei's useProgress — real asset progress
  const { progress: realProgress } = useProgress();

  // Detect fast-path (repeat session visit)
  const isFast = typeof window !== "undefined" &&
    sessionStorage.getItem(SESSION_KEY) === "1";

  // ── fast path (≤ 450 ms) ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isFast) return;
    let frame = 0;
    const target = Date.now() + FAST_DURATION;
    function tick() {
      const remaining = target - Date.now();
      const pct = Math.min(100, Math.round(100 - (remaining / FAST_DURATION) * 100));
      setDisplayPct(pct);
      setGraphProgress(pct / 100);
      if (pct < 100) {
        frame = requestAnimationFrame(tick);
      } else {
        exitAnimation();
      }
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFast]);

  // ── full path: track real asset loading ───────────────────────────────────
  useEffect(() => {
    if (isFast) return;
    const pct = Math.round(realProgress);
    setDisplayPct(pct);
    // Graph assembles slightly ahead of counter for visual effect
    setGraphProgress(Math.min(1, (realProgress + 15) / 100));
    if (pct >= 100 && !hasFiredRef.current) {
      hasFiredRef.current = true;
      // Small settle delay before wipe
      const timer = setTimeout(() => exitAnimation(), 300);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realProgress, isFast]);

  // ── exit animation: clip-path wipe up ─────────────────────────────────────
  const exitAnimation = useCallback(() => {
    if (!wrapperRef.current) return;
    sessionStorage.setItem(SESSION_KEY, "1");

    gsap.to(wrapperRef.current, {
      clipPath: "polygon(0% 0%, 100% 0%, 100% 0%, 0% 0%)",
      duration: 0.9,
      ease: "power4.inOut",
      onComplete: () => {
        setDone(true);
        onComplete();
      },
    });
  }, [onComplete]);

  if (done) return null;

  return (
    <div
      ref={wrapperRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#000",
        clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
        overflow: "hidden",
      }}
      aria-modal="true"
      aria-label="Loading InsightFlow"
      role="dialog"
    >
      {/* Wireframe graph assembles in the background */}
      <WireframePass progress={graphProgress} />

      {/* Subtle radial vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)",
          pointerEvents: "none",
          zIndex: 5,
        }}
      />

      <Wordmark />
      <Counter value={displayPct} />

      {/* Thin progress bar at bottom */}
      <div
        ref={overlayRef}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          height: 1,
          width: `${displayPct}%`,
          background: "linear-gradient(90deg, #f59e0b, #3b82f6)",
          zIndex: 20,
          transition: "width 0.1s linear",
        }}
      />
    </div>
  );
}
