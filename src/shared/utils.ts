/**
 * Canonical `cn` lives in `@/lib/utils`. This module re-exports it so the many
 * existing `@/shared/utils` imports keep working without a second tailwind-merge
 * instance or a divergent implementation (blueprint Wave 1).
 */
export { cn } from "@/lib/utils";
