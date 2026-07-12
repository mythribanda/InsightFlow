/**
 * useAnimationVariants — shared Framer Motion variant presets for InsightFlow panels.
 *
 * Philosophy: subtle, fast, spring-based. Never more than 200ms for micro-interactions.
 * All durations respect prefers-reduced-motion via Framer Motion's built-in detection
 * (motion.div automatically no-ops when the user prefers reduced motion).
 *
 * Usage:
 *   import { cardVariants, buttonVariants, listItemVariants, containerVariants } from "@/hooks/useAnimationVariants";
 *
 *   <motion.div variants={cardVariants} initial="hidden" animate="visible">...</motion.div>
 *   <motion.button whileHover="hover" whileTap="tap" variants={buttonVariants}>...</motion.button>
 */

export const cardVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
  },
};

/** Staggered list container — animate children one by one */
export const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.05,
    },
  },
};

/** List item — used inside containerVariants stagger */
export const listItemVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] },
  },
};

/** Button hover/press micro-interaction */
export const buttonVariants = {
  rest: { scale: 1 },
  hover: { scale: 1.03, transition: { duration: 0.12, ease: "easeOut" } },
  tap: { scale: 0.96, transition: { duration: 0.08, ease: "easeIn" } },
};

/** Badge / chip pop-in */
export const badgeVariants = {
  hidden: { opacity: 0, scale: 0.75 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring", stiffness: 400, damping: 22 },
  },
};

/** Panel entrance — slides up from slightly below */
export const panelVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
  },
};

/** Fade only — for elements that don't need spatial movement */
export const fadeVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};
