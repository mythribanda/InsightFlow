// src/components/reactbits/CountUp.tsx
// Animates a number from 0 to `to` on mount using GSAP.
// Compatible with React 19 / SSR — uses useEffect to run only on client.

import { useEffect, useRef } from "react";
import gsap from "gsap";

interface CountUpProps {
  /** Target number */
  to: number;
  /** Starting number (default 0) */
  from?: number;
  /** Number of decimal places (default 0) */
  decimals?: number;
  /** Animation duration in seconds (default 1.5) */
  duration?: number;
  /** Delay before animation starts in seconds (default 0) */
  delay?: number;
  /** Separator string (e.g. ",") */
  separator?: string;
  /** Suffix to append (e.g. "%") */
  suffix?: string;
  /** Prefix to prepend (e.g. "$") */
  prefix?: string;
  /** Extra className for the span */
  className?: string;
  /** Called when animation completes */
  onComplete?: () => void;
}

export function CountUp({
  to,
  from = 0,
  decimals = 0,
  duration = 1.5,
  delay = 0,
  separator = "",
  suffix = "",
  prefix = "",
  className = "",
  onComplete,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const obj = { value: from };
    const tween = gsap.to(obj, {
      value: to,
      duration,
      delay,
      ease: "power2.out",
      onUpdate() {
        const formatted = obj.value
          .toFixed(decimals)
          .replace(/\B(?=(\d{3})+(?!\d))/g, separator);
        el.textContent = `${prefix}${formatted}${suffix}`;
      },
      onComplete() {
        onComplete?.();
      },
    });

    return () => {
      tween.kill();
    };
  }, [to, from, decimals, duration, delay, separator, suffix, prefix, onComplete]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {from.toFixed(decimals)}
      {suffix}
    </span>
  );
}
