/**
 * RouteTransition — clip-path morph CTA → viewport wipe
 *
 * When triggered (ctaClicked=true):
 * 1. The CTA button expands via clip-path from its bounding box to fill
 *    the entire viewport (#000 fill).
 * 2. After the expansion completes, we navigate to the app route.
 *
 * Uses Framer Motion AnimatePresence. The overlay mounts on ctaClicked,
 * animates in, then calls onComplete (which does the actual navigation).
 */
"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface Props {
  triggered: boolean;
  onComplete: () => void;
}

export function RouteTransition({ triggered, onComplete }: Props) {
  const hasCalledRef = useRef(false);

  return (
    <AnimatePresence>
      {triggered && (
        <motion.div
          key="route-transition"
          initial={{
            clipPath: "circle(0% at 50% 80%)",
          }}
          animate={{
            clipPath: "circle(150% at 50% 80%)",
          }}
          transition={{
            duration: 0.9,
            ease: [0.22, 1, 0.36, 1],
          }}
          onAnimationComplete={() => {
            if (!hasCalledRef.current) {
              hasCalledRef.current = true;
              onComplete();
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "#000",
            zIndex: 9000,
          }}
          aria-hidden="true"
        >
          {/* InsightFlow wordmark fades in during transition */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: "clamp(14px, 2vw, 20px)",
              letterSpacing: "0.25em",
              color: "#94a3b8",
              textTransform: "uppercase",
            }}
          >
            InsightFlow
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
