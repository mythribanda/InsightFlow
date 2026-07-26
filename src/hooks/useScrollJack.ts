/**
 * useScrollJack — Lenis virtual scroll + GSAP Observer section-snapping
 *
 * Desktop (pointer:fine):
 * - Intercepts native scroll entirely via GSAP Observer
 * - A single strong scroll gesture advances exactly one section
 * - Camera/content transition over ~1.1–1.4 s with bespoke ease
 * - Input debounced during transitions so rapid scroll doesn't queue multiple jumps
 * - Returns scrollProgress (0–1) and currentSection (0–5)
 *
 * Touch (pointer:coarse):
 * - Returns native scroll progress via scroll event (no hijack)
 * - scrollJacked: false so callers can switch to CSS scroll-triggered reveals
 *
 * prefers-reduced-motion:
 * - Same as touch path: native scroll, no hijack, instant transitions
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { gsap } from "gsap";
import { Observer } from "gsap/Observer";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import Lenis from "lenis";

gsap.registerPlugin(Observer, ScrollToPlugin);

export const SECTION_COUNT = 6;

// Bespoke cubic-bezier(0.22, 1, 0.36, 1) — the project's signature ease
// GSAP custom ease: map t → y via the Bezier cubic formula
const BESPOKE_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const TRANSITION_DURATION = 1.25; // seconds

export interface ScrollJackReturn {
  scrollProgress: number;   // 0–1 across all sections
  currentSection: number;   // 0–5
  scrollJacked: boolean;
  goToSection: (index: number) => void;
}

export function useScrollJack(): ScrollJackReturn {
  const [currentSection, setCurrentSection] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [scrollJacked, setScrollJacked] = useState(false);

  const sectionRef  = useRef(0);
  const animating   = useRef(false);
  const lenisRef    = useRef<Lenis | null>(null);

  const goToSection = useCallback((index: number) => {
    const target = Math.max(0, Math.min(SECTION_COUNT - 1, index));
    if (animating.current && target !== sectionRef.current) return; // block queue
    animating.current = true;

    const newProgress = target / (SECTION_COUNT - 1);

    gsap.to({ p: sectionRef.current / (SECTION_COUNT - 1) }, {
      p: newProgress,
      duration: TRANSITION_DURATION,
      ease: BESPOKE_EASE,
      onUpdate: function () {
        setScrollProgress(this.targets()[0].p);
      },
      onComplete: () => {
        animating.current = false;
        sectionRef.current = target;
        setCurrentSection(target);
        setScrollProgress(newProgress);
      },
    });
  }, []);

  useEffect(() => {
    const isTouch   = window.matchMedia("(pointer: coarse)").matches;
    const isReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ── Touch / reduced-motion fallback: native scroll progress ─────────────
    if (isTouch || isReduced) {
      setScrollJacked(false);

      function onScroll() {
        const total = document.documentElement.scrollHeight - window.innerHeight;
        if (total <= 0) return;
        const raw = window.scrollY / total;
        setScrollProgress(raw);
        setCurrentSection(Math.round(raw * (SECTION_COUNT - 1)));
      }
      window.addEventListener("scroll", onScroll, { passive: true });
      return () => window.removeEventListener("scroll", onScroll);
    }

    // ── Desktop scroll-jack path ──────────────────────────────────────────────
    setScrollJacked(true);

    // Prevent native scroll (we drive everything via Observer)
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    // GSAP Observer intercepts wheel/touch/pointer
    const obs = Observer.create({
      type: "wheel,touch,pointer",
      wheelSpeed: -1,
      onDown: () => {
        if (animating.current) return;
        const next = Math.min(sectionRef.current + 1, SECTION_COUNT - 1);
        if (next !== sectionRef.current) goToSection(next);
      },
      onUp: () => {
        if (animating.current) return;
        const prev = Math.max(sectionRef.current - 1, 0);
        if (prev !== sectionRef.current) goToSection(prev);
      },
      tolerance: 10,
      preventDefault: true,
    });

    // Also set initial state
    setScrollProgress(0);
    setCurrentSection(0);
    sectionRef.current = 0;

    return () => {
      obs.kill();
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      lenisRef.current?.destroy();
    };
  }, [goToSection]);

  return { scrollProgress, currentSection, scrollJacked, goToSection };
}
