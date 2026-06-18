import { AnalyticsTheaterScreen } from "@/features/analytics-theater/screens/AnalyticsTheaterScreen";

export const metadata = {
  title: "Visual Analytics Theater",
  description:
    "Offline scrollytelling presentation mode over your active dataset: calendar heatmap, category race, flow, hourly activity, word cloud, and hierarchy — every chart a live DuckDB aggregation, exportable to PPTX/PDF.",
};

export default function AnalyticsTheaterPage() {
  return <AnalyticsTheaterScreen />;
}
