"use client";

import { TelecomReportRuntimeProvider } from "@/features/telecom/components/telecom-report-runtime";

export default function TelecomReportLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-0">
      <TelecomReportRuntimeProvider>{children}</TelecomReportRuntimeProvider>
    </div>
  );
}
