// src/components/DataPointsBackground.tsx
// Real canvas-based particle system that reacts to cursor movement.

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseX: number;
  baseY: number;
  radius: number;
  color: string;
}

export function DataPointsBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

    // Particle count scales with screen size, capped for perf
    const count = Math.min(70, Math.floor((width * height) / 18000));
    const particles: Particle[] = [];

    const colors = ["#0ea5e9", "#a855f7", "#22d3ee"];

    for (let i = 0; i < count; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      particles.push({
        x,
        y,
        baseX: x,
        baseY: y,
        vx: 0,
        vy: 0,
        radius: Math.random() * 1.8 + 1.2,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
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

      for (const p of particles) {
        // Attraction toward cursor within radius
        const attractRadius = 160;
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;

        if (mouse.active && dist < attractRadius) {
          const force = (1 - dist / attractRadius) * 0.6;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
        }

        // Gentle pull back toward original wandering position
        const homeDx = p.baseX - p.x;
        const homeDy = p.baseY - p.y;
        p.vx += homeDx * 0.0015;
        p.vy += homeDy * 0.0015;

        // Slow ambient drift of the base position
        p.baseX += (Math.random() - 0.5) * 0.15;
        p.baseY += (Math.random() - 0.5) * 0.15;

        // Damping
        p.vx *= 0.92;
        p.vy *= 0.92;

        p.x += p.vx;
        p.y += p.vy;

        // Wrap edges
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;
        if (p.y < -10) p.y = height + 10;
        if (p.y > height + 10) p.y = -10;

        ctx!.beginPath();
        ctx!.fillStyle = p.color;
        ctx!.globalAlpha = 0.75;
        ctx!.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx!.fill();
      }

      // Draw connecting lines between nearby particles for a "network" feel
      ctx!.globalAlpha = 1;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 90) {
            ctx!.strokeStyle = "#0ea5e9";
            ctx!.globalAlpha = (1 - dist / 90) * 0.15;
            ctx!.lineWidth = 1;
            ctx!.beginPath();
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(b.x, b.y);
            ctx!.stroke();
          }
        }
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
      style={{ opacity: 0.9 }}
    />
  );
}

export default DataPointsBackground;
