"use client";

/**
 * ExportButton
 *
 * Saves the geo report as PDF or XLSX through the shared export worker
 * (`exportGeoReport` → `getExportProxy` + `saveBytes`), entirely off the main
 * thread. The PDF embeds a real rasterised heatmap rendered by the chart worker
 * (vector SVG → resvg), never a DOM screenshot.
 */

import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportGeoReport, type GeoExportFormat, type GeoExportInput } from "../lib/geo-export";

export interface ExportButtonProps {
  /** Lazily built so we never serialise aggregates until an export is requested. */
  getInput: () => GeoExportInput;
  disabled?: boolean;
}

export function ExportButton({ getInput, disabled }: ExportButtonProps) {
  const [busy, setBusy] = useState<GeoExportFormat | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function run(format: GeoExportFormat) {
    setBusy(format);
    setStatus(null);
    try {
      const path = await exportGeoReport(getInput(), format);
      setStatus(path ? `Saved ${format.toUpperCase()}` : "Export cancelled");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {status && (
        <span className="text-xs text-muted-foreground" role="status">
          {status}
        </span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={disabled || busy !== null}>
            {busy ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-4 w-4" />
            )}
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => void run("pdf")} disabled={busy !== null}>
            <FileText className="mr-2 h-4 w-4" />
            PDF report (with heatmap)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void run("xlsx")} disabled={busy !== null}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Excel workbook
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
