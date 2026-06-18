import DashboardHomeScreen from "@/features/dashboard-home/screens/DashboardHomeScreen";

/**
 * Dashboard index.
 *
 * Renders the dataset-agnostic landing/KPI overview (telecom datasets get the
 * rich telecom view, any other dataset gets a generic DuckDB-backed overview).
 * Previously this route hard-redirected to /dashboard/telecom-report, which
 * made the home screen unreachable; the screen now routes by dataset kind.
 */
export default function Page() {
  return <DashboardHomeScreen />;
}
