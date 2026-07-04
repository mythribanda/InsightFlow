/**
 * CustomCursor
 *
 * Two-part cursor:
 * - 4 px solid dot at true cursor position (zero lag, hardware-transform only)
 * - 32 px ring that lerps to cursor with ~0.15 s lag
 *
 * On interactive element hover:
 * - Ring scales 32 → 60 px, dot disappears, ring becomes more opaque
 *
 * Magnetic pull on [data-magnetic] elements:
 * - Element translates up to 12 px toward cursor within 80 px radius
 * - Spring-back on mouseleave
 *
 * Hides itself on pointer:coarse (touch devices).
 * Respects prefers-reduced-motion (zeroes lag, no spring).
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";

// Bespoke ease for spring-back
const SPRING_EASE = "elastic.out(1.2, 0.5)";

export function CustomCursor() {
  const dotRef  = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const posRef  = useRef({ x: -200, y: -200 });
  const ringPos = useRef({ x: -200, y: -200 });
  const rafRef  = useRef<number>(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Hide on touch
    if (window.matchMedia("(pointer: coarse)").matches) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const LAG = prefersReduced ? 1 : 0.12;

    setVisible(true);
    document.body.style.cursor = "none";

    // ── pointer tracking ──────────────────────────────────────────────────
    function onMove(e: MouseEvent) {
      posRef.current = { x: e.clientX, y: e.clientY };
    }
    window.addEventListener("mousemove", onMove, { passive: true });

    // ── animation loop ────────────────────────────────────────────────────
    function tick() {
      const dot  = dotRef.current;
      const ring = ringRef.current;
      if (!dot || !ring) { rafRef.current = requestAnimationFrame(tick); return; }

      // Dot: hardware-composited, no lerp
      dot.style.transform = `translate3d(${posRef.current.x - 2}px, ${posRef.current.y - 2}px, 0)`;

      // Ring: lerp
      ringPos.current.x += (posRef.current.x - ringPos.current.x) * LAG;
      ringPos.current.y += (posRef.current.y - ringPos.current.y) * LAG;
      ring.style.transform = `translate3d(${ringPos.current.x - 16}px, ${ringPos.current.y - 16}px, 0)`;

      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    // ── hover states ──────────────────────────────────────────────────────
    function onEnter(e: MouseEvent) {
      const t = (e.target as HTMLElement).closest(
        "a, button, [data-magnetic], [data-cursor-hover]"
      );
      if (!t || !dotRef.current || !ringRef.current) return;
      gsap.to(ringRef.current, { width: 60, height: 60, opacity: 0.7, duration: 0.25, ease: "power2.out" });
      gsap.to(dotRef.current,  { opacity: 0, duration: 0.15 });
    }
    function onLeave(e: MouseEvent) {
      const t = (e.target as HTMLElement).closest(
        "a, button, [data-magnetic], [data-cursor-hover]"
      );
      if (!t || !dotRef.current || !ringRef.current) return;
      gsap.to(ringRef.current, { width: 32, height: 32, opacity: 0.5, duration: 0.25, ease: "power2.out" });
      gsap.to(dotRef.current,  { opacity: 1, duration: 0.15 });
    }
    document.addEventListener("mouseover",  onEnter, { passive: true });
    document.addEventListener("mouseout",   onLeave, { passive: true });

    // ── magnetic pull ─────────────────────────────────────────────────────
    const RADIUS = 80;
    const MAX_PULL = 12;

    const magneticEls = document.querySelectorAll<HTMLElement>("[data-magnetic]");
    const magneticCleanup: Array<() => void> = [];

    magneticEls.forEach((el) => {
      function onMagMove(e: MouseEvent) {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width  / 2;
        const cy = rect.top  + rect.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < RADIUS) {
          const pull = (1 - dist / RADIUS) * MAX_PULL;
          gsap.to(el, {
            x: (dx / dist) * pull,
            y: (dy / dist) * pull,
            duration: 0.3,
            ease: "power2.out",
          });
        }
      }
      function onMagLeave() {
        gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: SPRING_EASE });
      }
      document.addEventListener("mousemove", onMagMove, { passive: true });
      el.addEventListener("mouseleave", onMagLeave);
      magneticCleanup.push(() => {
        document.removeEventListener("mousemove", onMagMove);
        el.removeEventListener("mouseleave", onMagLeave);
      });
    });

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseover",  onEnter);
      document.removeEventListener("mouseout",   onLeave);
      magneticCleanup.forEach((fn) => fn());
      document.body.style.cursor = "";
    };
  }, []);

  if (!visible) return null;

  return (
    <>
      {/* Dot */}
      <div
        ref={dotRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: 4,
          height: 4,
          borderRadius: "50%",
          background: "#f8fafc",
          pointerEvents: "none",
          zIndex: 10000,
          willChange: "transform",
        }}
        aria-hidden="true"
      />
      {/* Ring */}
      <div
        ref={ringRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: "1px solid rgba(248, 250, 252, 0.5)",
          pointerEvents: "none",
          zIndex: 9999,
          willChange: "transform",
          opacity: 0.5,
        }}
        aria-hidden="true"
      />
    </>
  );
}
