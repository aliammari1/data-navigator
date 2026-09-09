import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level Suspense fallback for the heavy, code-split dashboard pages.
 * Mirrors the PageHeader + content-grid rhythm so the transition feels like the
 * page settling rather than a flash (critic gap #3).
 */
export default function DashboardLoading() {
  return (
    <div className="" role="status" aria-busy="true" aria-label="Chargement">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}
