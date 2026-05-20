"use client";

import { useEffect } from "react";

export function ReactScan() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    import("react-scan").then(({ scan }) => {
      scan({
        enabled: true,
        log: false,
        showToolbar: true,
      });
    });
  }, []);

  return null;
}
