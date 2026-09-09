"use client";

import { Database, Eye, Info } from "lucide-react";
import { Section } from "../controls";

export function AboutPanel() {
  return (
    <>
      <Section title="About DataNavigator" icon={Info}>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-primary to-violet-600 flex items-center justify-center">
              <Database className="w-7 h-7 text-primary-foreground" />
            </div>
            <div>
              <div className="text-lg font-bold text-foreground">DataNavigator</div>
              <div className="text-sm text-muted-foreground">offline-first data workspace</div>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Privacy & Data" icon={Eye}>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">100% offline</strong> — all data stays on this
            device. No telemetry, no cloud sync, no external API calls.
          </p>
          <p>
            <strong className="text-foreground">DuckDB</strong> runs locally (native on desktop,
            WebAssembly on the web build) and never uploads your data.
          </p>
          <p>
            <strong className="text-foreground">AI features</strong> use local algorithms and models
            cached on-device — your data never leaves the machine.
          </p>
          <p>
            <strong className="text-foreground">Settings</strong> are persisted durably in a local
            SQLite table and mirrored to localStorage for instant load. Use the Storage panel to
            back them up.
          </p>
        </div>
      </Section>
    </>
  );
}
