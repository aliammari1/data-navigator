/**
 * Ambient declaration for CSS side-effect imports (e.g. `uplot/dist/uPlot.min.css`).
 * The bundler (Next/Turbopack) handles these at build time; this keeps `tsc`
 * happy in isolation. Scoped to the viz subsystem to avoid sibling collisions.
 */
declare module "*.css";
