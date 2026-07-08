import { Suspense } from "react";
import SettingsScreen from "@/features/settings/screens/SettingsScreen";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SettingsScreen />
    </Suspense>
  );
}
