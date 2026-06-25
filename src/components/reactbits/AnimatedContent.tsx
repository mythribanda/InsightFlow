// src/components/reactbits/AnimatedContent.tsx
// Wraps tab content and replays entrance animation on key change.
// CRITICAL: use key={activeTab} on the parent to replay animation on tab switch.

import { useEffect, useRef } from "react";

type AnimationVariant = "fade" | "slide-up" | "slide-down" | "slide-left" | "scale";

interface AnimatedContentProps {
  children: React.ReactNode;
  /** Animation style (default "slide-up") */
  animation?: AnimationVariant;
  /** Duration in ms (default 350) */
  duration?: number;
  /** Easing (default "ease") */
  easing?: string;
  /** Extra className */
  className?: string;
  /** Distance in px for slide animations (default 16) */
  distance?: number;
  /** Initial scale for scale animation (default 0.97) */
  initialScale?: number;
}

const variantMap: Record<AnimationVariant, { from: React.CSSProperties; to: React.CSSProperties }> = {
  "fade": {
    from: { opacity: 0 },
    to:   { opacity: 1 },
  },
  "slide-up": {
    from: { opacity: 0, transform: "translateY(16px)" },
    to:   { opacity: 1, transform: "translateY(0)" },
  },
  "slide-down": {
    from: { opacity: 0, transform: "translateY(-16px)" },
    to:   { opacity: 1, transform: "translateY(0)" },
  },
  "slide-left": {
    from: { opacity: 0, transform: "translateX(16px)" },
    to:   { opacity: 1, transform: "translateX(0)" },
  },
  "scale": {
    from: { opacity: 0, transform: "scale(0.97)" },
    to:   { opacity: 1, transform: "scale(1)" },
  },
};

export function AnimatedContent({
  children,
  animation = "slide-up",
  duration = 350,
  easing = "ease",
  className = "",
  // distance and initialScale are baked into variantMap above
}: AnimatedContentProps) {
  const ref = useRef<HTMLDivElement>(null);
  const variant = variantMap[animation];

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Apply `from` immediately (synchronous)
    Object.assign(el.style, variant.from);
    el.style.transition = "none";

    // Force reflow so `from` state is painted before transition starts
    void el.offsetWidth;

    el.style.transition = `all ${duration}ms ${easing}`;
    Object.assign(el.style, variant.to);

    return () => {
      if (el) el.style.transition = "";
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
