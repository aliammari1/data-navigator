"use client";

import { useCallback, useState } from "react";
import { AIPanel, AIToggle } from "@/components/dashboard/ai-panel";
import {
  DashboardLayout,
  type DashboardUser,
} from "@/components/dashboard/sidebar-nav";

export function DashboardClientShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user?: DashboardUser;
}) {
  const [aiOpen, setAiOpen] = useState(false);
  const toggle = useCallback(() => setAiOpen((v) => !v), []);

  return (
    <DashboardLayout onAiToggle={toggle} user={user}>
      {children}
      <AIPanel open={aiOpen} onClose={() => setAiOpen(false)} />
      <AIToggle onClick={toggle} active={aiOpen} />
    </DashboardLayout>
  );
}
