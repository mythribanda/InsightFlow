/**
 * global-three.d.ts
 * Explicitly imports and re-exports the R3F JSX namespace extension so
 * TypeScript picks up mesh, group, ambientLight, etc. as valid JSX elements.
 *
 * This is required because TanStack Start's Vite plugin uses its own tsconfig
 * environment and the types[] array approach doesn't always propagate to all
 * compilation contexts.
 */
import "@react-three/fiber";
