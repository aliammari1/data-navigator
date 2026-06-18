"use client";

import { Bell } from "lucide-react";
import { toast } from "sonner";
import { useShallow } from "zustand/shallow";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/core/stores/settings-store";
import { notify } from "../../lib/notifications";
import { Section, SettingRow, Toggle } from "../controls";

export function NotificationsPanel() {
  const { uploads, queries, errors, collaboration, digest } = useSettingsStore(
    useShallow((s) => ({
      uploads: s.notifications.uploads,
      queries: s.notifications.queries,
      errors: s.notifications.errors,
      collaboration: s.notifications.collaboration,
      digest: s.notifications.digest,
    })),
  );
  const setNotifications = useSettingsStore((s) => s.setNotifications);

  return (
    <>
      <Section title="Notification Preferences" icon={Bell}>
        <Toggle
          checked={uploads}
          onChange={(v) => setNotifications({ uploads: v })}
          label="File uploads"
          description="Notify when a file finishes uploading or fails"
        />
        <Toggle
          checked={queries}
          onChange={(v) => setNotifications({ queries: v })}
          label="Long-running queries"
          description="Alert when a query takes more than 5 seconds"
        />
        <Toggle
          checked={errors}
          onChange={(v) => setNotifications({ errors: v })}
          label="Errors & warnings"
          description="DuckDB errors, parse failures, data quality issues"
        />
        <Toggle
          checked={collaboration}
          onChange={(v) => setNotifications({ collaboration: v })}
          label="Collaboration"
          description="Comments, mentions, and team activity (LAN-only)"
        />
        <Toggle
          checked={digest}
          onChange={(v) => setNotifications({ digest: v })}
          label="Daily digest"
          description="Summary of activity (stored locally, fully offline)"
        />
      </Section>

      <Section title="Preview" icon={Bell}>
        <SettingRow
          label="Test notifications"
          description="These respect the toggles above — disabled categories stay silent"
        >
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const shown = notify("uploads", "Upload complete", {
                  kind: "success",
                  description: "sample.csv · 12,304 rows",
                });
                if (!shown)
                  toast.info("Upload notifications are off", {
                    description: "Enable 'File uploads' above to see them.",
                  });
              }}
            >
              Upload toast
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const shown = notify("queries", "Query finished", {
                  description: "SELECT … took 6.2s",
                });
                if (!shown)
                  toast.info("Query notifications are off", {
                    description: "Enable 'Long-running queries' above.",
                  });
              }}
            >
              Query toast
            </Button>
          </div>
        </SettingRow>
      </Section>
    </>
  );
}
