import DataBrowserScreen from "@/features/data-browser/screens/DataBrowserScreen";

export default function Page() {
  // The screen opens the first catalogued dataset by default; pass `tableName`
  // to deep-link a specific dataset view. No telecom prop plumbing required.
  return <DataBrowserScreen />;
}
