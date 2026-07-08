import { Suspense } from "react";
import { ForecastScreen } from "@/features/forecast-intelligence/screens/ForecastScreen";

export const metadata = {
  title: "Predictive Analytics | Data Navigator",
  description:
    "AI-powered forecasting, revenue simulation, pattern detection, risk assessment, and scenario planning for telecom analytics.",
};

function ForecastSkeleton() {
  return (
    <div className="min-h-screen bg-slate-950 animate-pulse">
      <div className="border-b border-slate-800/60 bg-slate-900/40 px-6 py-5">
        <div className="h-6 w-48 rounded-lg bg-slate-800" />
        <div className="mt-1.5 h-4 w-72 rounded-md bg-slate-800/60" />
      </div>
      <div className="border-b border-slate-800/60 bg-slate-900/20 px-6 py-0">
        <div className="flex gap-1 py-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 w-32 rounded-lg bg-slate-800/60 mx-1" />
          ))}
        </div>
      </div>
      <div className="px-6 py-6 max-w-7xl mx-auto space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-slate-900/60" />
          ))}
        </div>
        <div className="h-80 rounded-xl bg-slate-900/60" />
        <div className="h-48 rounded-xl bg-slate-900/60" />
      </div>
    </div>
  );
}

export default function ForecastPage() {
  return (
    <Suspense fallback={<ForecastSkeleton />}>
      <ForecastScreen />
    </Suspense>
  );
}
