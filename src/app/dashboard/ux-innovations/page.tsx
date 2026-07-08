import { Suspense } from "react";
import UxInnovationsScreen from "@/features/ux-innovations/screens/UxInnovationsScreen";

/**
 * Achievements & onboarding route.
 *
 * Renders the gamification screen (real, telemetry-driven progress) plus the
 * first-visit guided tour. The heavy achievement UI is code-split inside the
 * screen, so this route's first-load JS stays small.
 */
export default function Page() {
  return (
    <Suspense>
      <UxInnovationsScreen />
    </Suspense>
  );
}
