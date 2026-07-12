/**
 * confetti.ts — one-shot confetti bursts for key milestone moments.
 *
 * Triggers:
 *   - First successful ML model training completion  → fireModelTrainingConfetti()
 *   - First successful dashboard/project save         → fireDashboardSaveConfetti()
 *
 * Both are guarded by localStorage so they fire EXACTLY ONCE per browser, never again.
 * Intentionally subtle: low particleCount, soft colors, short duration.
 */

import confetti from "canvas-confetti";

const KEYS = {
  modelTrained: "insightflow:confetti:model-trained",
  dashboardSaved: "insightflow:confetti:dashboard-saved",
} as const;

function hasAlreadyFired(key: string): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(key) === "1";
}

function markFired(key: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(key, "1");
  }
}

/**
 * Subtle confetti burst from both bottom corners — celebrates model training.
 * Uses brand-adjacent purples + teals, 80 particles, 2-second lifespan.
 */
export function fireModelTrainingConfetti(): void {
  if (hasAlreadyFired(KEYS.modelTrained)) return;
  markFired(KEYS.modelTrained);

  const opts: confetti.Options = {
    particleCount: 80,
    spread: 55,
    startVelocity: 30,
    gravity: 0.9,
    ticks: 120,
    colors: ["#8b5cf6", "#6366f1", "#22d3ee", "#34d399", "#a78bfa", "#c4b5fd"],
    shapes: ["circle", "square"],
    scalar: 0.9,
    disableForReducedMotion: true,
  };

  // Left cannon
  confetti({ ...opts, origin: { x: 0.15, y: 0.85 }, angle: 60 });
  // Right cannon — slight delay for a natural feel
  setTimeout(() => {
    confetti({ ...opts, origin: { x: 0.85, y: 0.85 }, angle: 120 });
  }, 150);
}

/**
 * Gentle confetti rain from the top-centre — celebrates first project save.
 * Softer: fewer particles, more translucent, shorter life.
 */
export function fireDashboardSaveConfetti(): void {
  if (hasAlreadyFired(KEYS.dashboardSaved)) return;
  markFired(KEYS.dashboardSaved);

  confetti({
    particleCount: 55,
    spread: 80,
    startVelocity: 20,
    origin: { x: 0.5, y: 0 },
    gravity: 0.7,
    ticks: 100,
    colors: ["#8b5cf6", "#22d3ee", "#34d399", "#f472b6", "#fbbf24"],
    scalar: 0.8,
    disableForReducedMotion: true,
  });
}

/**
 * Reset both guards — useful in development / testing.
 * Call from the browser console: window.__resetConfetti?.()
 */
if (typeof window !== "undefined") {
  (window as any).__resetConfetti = () => {
    localStorage.removeItem(KEYS.modelTrained);
    localStorage.removeItem(KEYS.dashboardSaved);
    console.info("[confetti] Guards reset. Next trigger will fire.");
  };
}
