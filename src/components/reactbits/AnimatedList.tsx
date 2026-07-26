// src/components/reactbits/AnimatedList.tsx
// Staggered-entry list. Children animate in one-by-one with slide+fade.
// Works on initial mount or when `key` changes (e.g. new dataset).

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface AnimatedListProps {
  /** Items to render — each should be a unique renderable node */
  items: React.ReactNode[];
  /** Delay between each item appearing in ms (default 80) */
  itemDelay?: number;
  /** Duration of each item's entrance in ms (default 400) */
  animateDuration?: number;
  /** Extra className for the <ul> wrapper */
  className?: string;
  /** Extra className applied to each <li> */
  itemClassName?: string;
}

export function AnimatedList({
  items,
  itemDelay = 80,
  animateDuration = 400,
  className = "",
  itemClassName = "",
}: AnimatedListProps) {
  const [visibleCount, setVisibleCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setVisibleCount(0);
    let count = 0;
    const tick = () => {
      count++;
      setVisibleCount(count);
      if (count < items.length) {
        timerRef.current = setTimeout(tick, itemDelay);
      }
    };
    timerRef.current = setTimeout(tick, itemDelay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  return (
    <ul className={cn("space-y-1.5", className)}>
      {items.map((item, i) => (
        <li
          key={i}
          className={itemClassName}
          style={{
            opacity: i < visibleCount ? 1 : 0,
            transform: i < visibleCount ? "translateY(0)" : "translateY(10px)",
            transition: `opacity ${animateDuration}ms ease, transform ${animateDuration}ms ease`,
          }}
        >
          {item}
        </li>
      ))}
    </ul>
  );
}
