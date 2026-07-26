// src/components/reactbits/BlurText.tsx
// Reveals text word-by-word with a blur-in effect using CSS animations + GSAP.
// One-shot gate: pass `key` from parent to replay; do not unmount/remount on tab re-entry.

import { useEffect, useRef, useState } from "react";

interface BlurTextProps {
  /** The text to reveal */
  text: string;
  /** Delay between each word in ms (default 80) */
  delay?: number;
  /** Duration of each word's blur-in in ms (default 500) */
  animateDuration?: number;
  /** Extra className for the wrapper span */
  className?: string;
  /** Extra className for each word span */
  wordClassName?: string;
  /** Called when all words have revealed */
  onAnimationComplete?: () => void;
}

export function BlurText({
  text,
  delay = 80,
  animateDuration = 500,
  className = "",
  wordClassName = "",
  onAnimationComplete,
}: BlurTextProps) {
  const words = text.split(" ");
  const [visibleCount, setVisibleCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setVisibleCount(0);
    let count = 0;
    const tick = () => {
      count++;
      setVisibleCount(count);
      if (count < words.length) {
        timerRef.current = setTimeout(tick, delay);
      } else {
        onAnimationComplete?.();
      }
    };
    timerRef.current = setTimeout(tick, delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <span className={className} aria-label={text}>
      {words.map((word, i) => (
        <span
          key={i}
          aria-hidden
          className={wordClassName}
          style={{
            display: "inline-block",
            marginRight: "0.25em",
            opacity: i < visibleCount ? 1 : 0,
            filter: i < visibleCount ? "blur(0px)" : "blur(8px)",
            transform: i < visibleCount ? "translateY(0)" : "translateY(6px)",
            transition: `opacity ${animateDuration}ms ease, filter ${animateDuration}ms ease, transform ${animateDuration}ms ease`,
          }}
        >
          {word}
        </span>
      ))}
    </span>
  );
}
