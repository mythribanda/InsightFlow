/**
 * SideProgress — persistent vertical 6-dot progress indicator
 *
 * - Shows which section is active (filled dot)
 * - Click to jump directly to a section (bypasses sequential scroll-jack)
 * - Magnetic pull via [data-magnetic] attribute (handled by CustomCursor)
 * - Animated with GSAP on section change
 */
"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

const SECTION_LABELS = [
  "Hero",
  "Trust Score",
  "Leakage Scan",
  "SHAP",
  "Anomaly",
  "Launch",
];

interface Props {
  currentSection: number;
  total: number;
  onJump: (index: number) => void;
}

export function SideProgress({ currentSection, total, onJump }: Props) {
  const dotsRef = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    dotsRef.current.forEach((dot, i) => {
      if (!dot) return;
      const isActive = i === currentSection;
      gsap.to(dot, {
        scaleX: isActive ? 2.5 : 1,
        opacity: isActive ? 1 : 0.35,
        duration: 0.4,
        ease: "power2.out",
      });
    });
  }, [currentSection]);

  return (
    <nav
      aria-label="Section navigation"
      style={{
        position: "fixed",
        right: "clamp(16px, 3vw, 40px)",
        top: "50%",
        transform: "translateY(-50%)",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        zIndex: 200,
      }}
    >
      {Array.from({ length: total }).map((_, i) => (
        <button
          key={i}
          ref={(el) => { dotsRef.current[i] = el; }}
          onClick={() => onJump(i)}
          data-magnetic
          aria-label={`Go to section: ${SECTION_LABELS[i] ?? i + 1}`}
          aria-current={i === currentSection ? "true" : undefined}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: i === currentSection ? "#f8fafc" : "#64748b",
            border: "none",
            padding: 0,
            cursor: "pointer",
            opacity: i === currentSection ? 1 : 0.35,
            transformOrigin: "center",
            transition: "background 0.3s",
            position: "relative",
          }}
        >
          {/* Tooltip label */}
          <span
            style={{
              position: "absolute",
              right: "calc(100% + 12px)",
              top: "50%",
              transform: "translateY(-50%)",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 10,
              letterSpacing: "0.1em",
              color: "#94a3b8",
              whiteSpace: "nowrap",
              opacity: i === currentSection ? 1 : 0,
              transition: "opacity 0.3s",
              pointerEvents: "none",
            }}
          >
            {SECTION_LABELS[i]}
          </span>
        </button>
      ))}
    </nav>
  );
}
