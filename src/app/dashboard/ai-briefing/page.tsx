import { Suspense } from "react";
import AIBriefingScreen from "@/features/ai-briefing/screens/AIBriefingScreen";

export default function AIBriefingPage() {
  return (
    <Suspense>
      <AIBriefingScreen />
    </Suspense>
  );
}
