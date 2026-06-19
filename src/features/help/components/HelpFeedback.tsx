"use client";

import { Check, Loader2, MessageSquarePlus, ShieldCheck } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/shared/utils";
import { addFeedback, countFeedback } from "../lib/onboarding-db";

/**
 * Local, on-device feedback capture.
 *
 * Replaces the previous hardcoded external GitHub link. Entries are written to
 * IndexedDB via Dexie and never leave the machine — fully offline.
 */
export function HelpFeedback() {
  const route = usePathname() ?? "";
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    countFeedback()
      .then((n) => {
        if (!cancelled) setSavedCount(n);
      })
      .catch(() => {
        if (!cancelled) setSavedCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit() {
    const trimmed = message.trim();
    if (!trimmed || saving) return;

    setSaving(true);
    try {
      const id = await addFeedback({ message: trimmed, route });
      if (id === null) return;
      setMessage("");
      setJustSaved(true);
      setSavedCount((prev) => (prev === null ? 1 : prev + 1));
      toast.success("Feedback saved locally", {
        description: "It stays on this device — no data left your machine.",
      });
      window.setTimeout(() => setJustSaved(false), 4000);
    } catch (error) {
      toast.error(`Could not save feedback: ${String(error).slice(0, 120)}`);
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = message.trim().length > 0 && !saving;

  return (
    <div className="border-t border-border pt-6 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-none">
          <MessageSquarePlus className="w-4 h-4 text-indigo-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Found a bug or have a request?</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            Saved locally — nothing is sent over the network.
          </p>
        </div>
      </div>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void handleSubmit();
          }
        }}
        placeholder="Describe the issue or idea…"
        rows={3}
        className="w-full rounded-xl border border-border bg-muted p-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-indigo-500/50 transition-colors resize-y"
      />

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {savedCount !== null && savedCount > 0
            ? `${savedCount} note${savedCount === 1 ? "" : "s"} stored on this device`
            : "Press Ctrl+Enter to save"}
        </span>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            canSubmit
              ? "bg-indigo-600 text-white hover:bg-indigo-500"
              : "bg-muted text-muted-foreground cursor-not-allowed",
          )}
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : justSaved ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <MessageSquarePlus className="w-3.5 h-3.5" />
          )}
          {saving ? "Saving…" : justSaved ? "Saved" : "Save feedback"}
        </button>
      </div>
    </div>
  );
}
