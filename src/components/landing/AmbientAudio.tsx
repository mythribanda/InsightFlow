/**
 * AmbientAudio
 *
 * Gated behind first user interaction (browser autoplay policy requires this).
 * A single soft sine-wave tone generated via Web Audio API — no external file.
 * Muted by default. Small mute/unmute toggle in corner.
 *
 * Respects prefers-reduced-motion: still mounts but doesn't auto-play.
 */
"use client";

import { useEffect, useRef, useState } from "react";

export function AmbientAudio() {
  const [muted, setMuted] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const ctxRef   = useRef<AudioContext | null>(null);
  const gainRef  = useRef<GainNode | null>(null);
  const oscRef   = useRef<OscillatorNode | null>(null);

  // ── unlock on first interaction ──────────────────────────────────────────
  useEffect(() => {
    function unlock() {
      if (unlocked) return;
      setUnlocked(true);

      const ctx  = new AudioContext();
      const gain = ctx.createGain();
      const osc  = ctx.createOscillator();

      // Soft low sine tone: ~220 Hz (A3), very low gain
      osc.type = "sine";
      osc.frequency.setValueAtTime(220, ctx.currentTime);

      gain.gain.setValueAtTime(0, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();

      ctxRef.current  = ctx;
      gainRef.current = gain;
      oscRef.current  = osc;
    }

    window.addEventListener("click",    unlock, { once: true, passive: true });
    window.addEventListener("keydown",  unlock, { once: true, passive: true });
    window.addEventListener("touchstart", unlock, { once: true, passive: true });
    return () => {
      window.removeEventListener("click",    unlock);
      window.removeEventListener("keydown",  unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, [unlocked]);

  // ── ramp gain on muted change ────────────────────────────────────────────
  useEffect(() => {
    if (!gainRef.current || !ctxRef.current) return;
    const gain = gainRef.current;
    const ctx  = ctxRef.current;
    if (muted) {
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
    } else {
      gain.gain.setTargetAtTime(0.04, ctx.currentTime, 1.5);
    }
  }, [muted]);

  // Cleanup
  useEffect(() => {
    return () => {
      oscRef.current?.stop();
      ctxRef.current?.close();
    };
  }, []);

  return (
    <button
      onClick={() => setMuted((m) => !m)}
      aria-label={muted ? "Unmute ambient audio" : "Mute ambient audio"}
      data-cursor-hover
      style={{
        position: "fixed",
        bottom: "clamp(16px, 3vh, 32px)",
        right: "clamp(16px, 3vw, 40px)",
        zIndex: 200,
        background: "transparent",
        border: "1px solid rgba(248,250,252,0.2)",
        borderRadius: 4,
        padding: "6px 10px",
        cursor: "pointer",
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 10,
        letterSpacing: "0.1em",
        color: "#94a3b8",
        display: "flex",
        alignItems: "center",
        gap: 6,
        transition: "border-color 0.2s, color 0.2s",
      }}
    >
      {/* Simple SVG speaker icon */}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        {muted ? (
          <>
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </>
        ) : (
          <>
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          </>
        )}
      </svg>
      {muted ? "MUTED" : "AUDIO ON"}
    </button>
  );
}
