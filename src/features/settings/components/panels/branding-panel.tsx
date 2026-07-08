"use client";

import { Loader2 } from "lucide-react";
import { useBranding } from "@/core/branding/use-branding";
import { BrandingForm } from "../branding-form";

/**
 * Global export branding — applied to every generated PPTX/DOCX/PDF/XLSX
 * report. Previously a Report Studio-local tab; centralized here since
 * "applyToAll" makes it an app-wide default, not a per-report setting. Report
 * Studio still reads the same profile (via `@/core/branding`) to stamp exports.
 */
export function BrandingPanel() {
  const { branding, loaded, update, setLogoFromFile, clearLogo } = useBranding();

  if (!loaded) {
    return (
      <div className="flex items-center gap-2 px-1 py-8 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <BrandingForm
      branding={branding}
      update={update}
      setLogoFromFile={setLogoFromFile}
      clearLogo={clearLogo}
    />
  );
}
