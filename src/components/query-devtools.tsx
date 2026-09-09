"use client";

import { type ComponentType, lazy, Suspense } from "react";

type DevtoolsProps = {
  initialIsOpen?: boolean;
  buttonPosition?: "bottom-left" | "bottom-right" | "top-left" | "top-right";
  position?: "left" | "right" | "bottom";
};

function NullDevtools(_props: DevtoolsProps): null {
  return null;
}

// React Query devtools are a devDependency: they must never ship in the
// production bundle. The dynamic import keeps them in a separate chunk and the
// NODE_ENV gate lets the bundler drop the dev branch entirely in production.
const LazyDevtools: ComponentType<DevtoolsProps> =
  process.env.NODE_ENV === "production"
    ? NullDevtools
    : lazy(() =>
        import("@tanstack/react-query-devtools").then((m) => ({
          default: m.ReactQueryDevtools,
        })),
      );

export function QueryDevtools() {
  return (
    <Suspense fallback={null}>
      <LazyDevtools initialIsOpen={false} buttonPosition="bottom-left" position="left" />
    </Suspense>
  );
}
