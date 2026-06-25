// src/components/reactbits/Aurora.tsx
// Animated aurora/gradient background using CSS keyframes.
// Lighter than SplashCursor (CSS-only, no WebGL) — safe for screens people read.
// DO NOT use on the same route as SplashCursor.

import { useEffect, useRef } from "react";

interface AuroraProps {
  /** Colors for the aurora blobs. Defaults to cyan/purple/indigo palette. */
  colors?: string[];
  /** Speed multiplier (1 = normal, 0.5 = slow, 2 = fast). Default 1. */
  speed?: number;
  /** Amplitude of blur (default 80px) */
  blur?: number;
  /** Additional className for the container */
  className?: string;
}

export function Aurora({
  colors = [
    "hsl(192 100% 50% / 0.18)",
    "hsl(262 100% 65% / 0.16)",
    "hsl(220 100% 60% / 0.14)",
    "hsl(180 100% 45% / 0.12)",
  ],
  speed = 1,
  blur = 80,
  className = "",
}: AuroraProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Inject keyframes once
  useEffect(() => {
    const styleId = "aurora-keyframes";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @keyframes aurora-float-0 {
        0%, 100% { transform: translate(0%, 0%) scale(1); }
        33%       { transform: translate(5%, -8%) scale(1.08); }
        66%       { transform: translate(-4%, 6%) scale(0.95); }
      }
      @keyframes aurora-float-1 {
        0%, 100% { transform: translate(0%, 0%) scale(1); }
        33%       { transform: translate(-6%, 5%) scale(1.1); }
        66%       { transform: translate(7%, -4%) scale(0.92); }
      }
      @keyframes aurora-float-2 {
        0%, 100% { transform: translate(0%, 0%) scale(1); }
        50%       { transform: translate(4%, 4%) scale(1.06); }
      }
      @keyframes aurora-float-3 {
        0%, 100% { transform: translate(0%, 0%) scale(1); }
        40%       { transform: translate(-5%, -5%) scale(1.04); }
        80%       { transform: translate(3%, 7%) scale(0.97); }
      }
    `;
    document.head.appendChild(style);
  }, []);

  const blobs = [
    { top: "10%",  left: "15%",  size: "55%",  anim: "aurora-float-0" },
    { top: "30%",  left: "55%",  size: "50%",  anim: "aurora-float-1" },
    { top: "55%",  left: "10%",  size: "45%",  anim: "aurora-float-2" },
    { top: "5%",   left: "70%",  size: "40%",  anim: "aurora-float-3" },
  ];

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
      }}
      aria-hidden
    >
      {blobs.map((blob, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: blob.top,
            left: blob.left,
            width: blob.size,
            height: blob.size,
            borderRadius: "50%",
            background: colors[i % colors.length],
            filter: `blur(${blur}px)`,
            animation: `${blob.anim} ${(18 + i * 4) / speed}s ease-in-out infinite`,
            willChange: "transform",
          }}
        />
      ))}
    </div>
  );
}
