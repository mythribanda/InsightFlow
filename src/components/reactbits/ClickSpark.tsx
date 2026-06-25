// src/components/reactbits/ClickSpark.tsx
// Wraps a button (or any element). On click, spawns radial spark particles.
// Only for high-stakes action buttons — "Train Both Models", "Download CSV".

import { useRef, useState, useCallback } from "react";

interface Spark {
  id: number;
  x: number;
  y: number;
  angle: number;
}

interface ClickSparkProps {
  /** The button/element to wrap */
  children: React.ReactNode;
  /** Number of sparks (default 8) */
  sparkCount?: number;
  /** Color of sparks (default var(--color-primary)) */
  sparkColor?: string;
  /** Spark size in px (default 6) */
  sparkSize?: number;
  /** How far sparks travel in px (default 40) */
  sparkRadius?: number;
  /** Animation duration in ms (default 500) */
  duration?: number;
  /** Extra className for the wrapper */
  className?: string;
}

export function ClickSpark({
  children,
  sparkCount = 8,
  sparkColor = "var(--color-primary)",
  sparkSize = 6,
  sparkRadius = 48,
  duration = 600,
  className = "",
}: ClickSparkProps) {
  const [sparks, setSparks] = useState<Spark[]>([]);
  const idRef = useRef(0);

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const newSparks: Spark[] = Array.from({ length: sparkCount }, (_, i) => ({
      id: idRef.current++,
      x,
      y,
      angle: (i / sparkCount) * 360,
    }));
    setSparks((prev) => [...prev, ...newSparks]);

    setTimeout(() => {
      const ids = new Set(newSparks.map((s) => s.id));
      setSparks((prev) => prev.filter((s) => !ids.has(s.id)));
    }, duration + 100);
  }, [sparkCount, duration]);

  return (
    <div
      className={className}
      style={{ position: "relative", display: "inline-flex" }}
      onClick={handleClick}
    >
      {children}
      {sparks.map((spark) => (
        <SparkParticle
          key={spark.id}
          x={spark.x}
          y={spark.y}
          angle={spark.angle}
          color={sparkColor}
          size={sparkSize}
          radius={sparkRadius}
          duration={duration}
        />
      ))}
    </div>
  );
}

function SparkParticle({
  x, y, angle, color, size, radius, duration,
}: {
  x: number; y: number; angle: number;
  color: string; size: number; radius: number; duration: number;
}) {
  const rad = (angle * Math.PI) / 180;
  const tx = Math.cos(rad) * radius;
  const ty = Math.sin(rad) * radius;

  return (
    <span
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        pointerEvents: "none",
        animation: `spark-fly ${duration}ms ease-out forwards`,
        ["--tx" as string]: `${tx}px`,
        ["--ty" as string]: `${ty}px`,
        boxShadow: `0 0 ${size * 2}px ${color}`,
      }}
    />
  );
}

// Inject keyframes once globally
if (typeof document !== "undefined") {
  const styleId = "click-spark-keyframes";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @keyframes spark-fly {
        0%   { opacity: 1; transform: translate(0, 0) scale(1); }
        80%  { opacity: 0.6; transform: translate(var(--tx), var(--ty)) scale(0.6); }
        100% { opacity: 0; transform: translate(calc(var(--tx) * 1.1), calc(var(--ty) * 1.1)) scale(0); }
      }
    `;
    document.head.appendChild(style);
  }
}
