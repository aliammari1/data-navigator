"use client";

import { useEffect } from "react";
import { useAppContextStore } from "@/core/stores/app-context-store";
import { TelecomDashboard } from "@/features/telecom/components/telecom-dashboard";
import { useTelecomStore } from "@/features/telecom/store";

export default function Page() {
  const setContext = useAppContextStore((s) => s.setContext);
  useEffect(() => {
    useTelecomStore.getState().setActiveTab("overview");
    setContext({ activeDomain: "telecom" });
  }, [setContext]);

  return <TelecomDashboard />;
}
