/**
 * Minimal ambient types for `canvas-confetti` (ships no bundled types and there
 * is no `@types/canvas-confetti` installed). Covers only the surface this
 * feature uses: the default callable + `create(canvas, { resize, useWorker })`
 * factory and `reset()`. Kept feature-local so it does not leak globally.
 */
declare module "canvas-confetti" {
  interface ConfettiOptions {
    particleCount?: number;
    angle?: number;
    spread?: number;
    startVelocity?: number;
    decay?: number;
    gravity?: number;
    drift?: number;
    ticks?: number;
    origin?: { x?: number; y?: number };
    colors?: string[];
    shapes?: Array<"square" | "circle" | "star">;
    scalar?: number;
    zIndex?: number;
    disableForReducedMotion?: boolean;
  }

  interface GlobalOptions {
    resize?: boolean;
    useWorker?: boolean;
    disableForReducedMotion?: boolean;
  }

  type CreateTypes = ((options?: ConfettiOptions) => Promise<undefined> | null) & {
    reset: () => void;
  };

  interface ConfettiFn {
    (options?: ConfettiOptions): Promise<undefined> | null;
    create(canvas?: HTMLCanvasElement, options?: GlobalOptions): CreateTypes;
    reset(): void;
  }

  const confetti: ConfettiFn;
  export default confetti;
}
