import type { Metadata } from "next";
import { ReportStudioScreen } from "@/features/report-studio/screens/ReportStudioScreen";

export const metadata: Metadata = {
  title: "Executive Report Studio",
  description: "Generate professional PowerPoint, Word, and PDF reports from transaction data",
};

export default function ReportStudioPage() {
  return <ReportStudioScreen />;
}
