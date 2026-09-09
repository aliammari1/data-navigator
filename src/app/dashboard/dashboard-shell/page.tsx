import { ShellOverviewScreen } from "@/features/dashboard-shell/screens/shell-overview-screen";

/**
 * Shell overview / diagnostics route.
 *
 * Renders the live offline-first runtime status (engine, local model, LAN,
 * storage, persisted layout) owned by the dashboard-shell feature.
 */
export default function Page() {
  return <ShellOverviewScreen />;
}
