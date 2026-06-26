// src/components/DataPointsBackground.tsx
// Straight 2D dot grid with per-point jitter to eliminate moire diagonal banding.
//
// WHY THIS CHANGED: a perfectly uniform grid of evenly-spaced, similarly-sized dots
// produces a moire illusion -- the human eye perceives diagonal streaks across a grid
// that is mathematically 100% straight. Confirmed via DevTools: canvas transform and
// parent transform were both "none". The fix is jitter, not a rotation removal.

import { useEffect, useRef } from "react";

interface ProjectedPoint {
  x: number;
  y: number;
  radius: number;
  color: string;
}

export function DataPointsBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Stable per-point jitter offsets, generated once, not re-randomized every frame
  // (re-randomizing every frame would make the grid shimmer/vibrate instead of sit still)
  const jitterRef = useRef<{ jx: number; jy: number }[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    const mouse = { x: width / 2, y: height / 2, active: false };

    const cols = 65;
    const rows = 35;
    const totalPoints = cols * rows;

    // Generate stable jitter once. Magnitude is intentionally small (max ~4px)
    // so the grid still reads as organized, just not perfectly periodic.
    if (jitterRef.current.length !== totalPoints) {
      jitterRef.current = Array.from({ length: totalPoints }, () => ({
        jx: (Math.random() - 0.5) * 8,
        jy: (Math.random() - 0.5) * 8,
      }));
    }

    function handleResize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = width;
      canvas!.height = height;
    }

    function handleMouseMove(e: MouseEvent) {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
    }

    function handleMouseLeave() {
      mouse.active = false;
    }

    window.addEventListener("resize", handleResize);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", handleMouseLeave);

    let rafId: number;

    function animate() {
      ctx!.clearRect(0, 0, width, height);

      const projectedPoints: ProjectedPoint[] = [];
      let idx = 0;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const gridX = (width / (cols - 1)) * c;
          const gridY = (height / (rows - 1)) * r;

          const { jx, jy } = jitterRef.current[idx];
          let drawX = gridX + jx;
          let drawY = gridY + jy;
          idx++;

          const colRatio = c / (cols - 1);
          const h = 195 + colRatio * 110;
          let l = 45;

          let radiusMultiplier = 1.0;
          let alphaBoost = 0.0;

          if (mouse.active) {
            const dx = mouse.x - drawX;
            const dy = mouse.y - drawY;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;

            if (dist < 180) {
              const force = 1 - dist / 180;
              drawX += (mouse.x - drawX) * force * 0.38;
              drawY += (mouse.y - drawY) * force * 0.38;

              l += force * 15;
              radiusMultiplier = 1.0 + force * 0.6;
              alphaBoost = force * 0.32;
            }
          }

          const alpha = 0.22 + alphaBoost;
          const color = `hsla(${h.toFixed(1)}, 95%, ${l.toFixed(0)}%, ${alpha.toFixed(3)})`;
          const radius = Math.max(0.6, 1.4 * radiusMultiplier);

          projectedPoints.push({ x: drawX, y: drawY, radius, color });
        }
      }

      for (const pt of projectedPoints) {
        ctx!.beginPath();
        ctx!.fillStyle = pt.color;
        ctx!.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
        ctx!.fill();
      }

      rafId = requestAnimationFrame(animate);
    }

    animate();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ opacity: 0.95 }}
    />
  );
}

export default DataPointsBackground;
