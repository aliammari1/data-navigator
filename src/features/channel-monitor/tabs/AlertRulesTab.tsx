"use client";

import { useState } from "react";
import { cn } from "@/shared/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAI } from "@/platform/ai/provider";
import { fmtN } from "@/features/telecom/lib/format";
import { CHANNELS } from "../lib/channels";
import { formatDateTime } from "../lib/format-helpers";
import { conditionLabel, metricLabel, severityBadgeClass } from "../lib/ui-helpers";
import {
  buildSuggestionPrompt,
  type ThresholdSuggestion,
  ThresholdSuggestionSchema,
} from "../lib/ai-suggestions";
import { useMonitorStore } from "../store/monitor-store";
import type {
  AlertAction,
  AlertCondition,
  AlertMetric,
  AlertRule,
  AlertSeverity,
} from "../store/monitor-store";

const EMPTY_RULE: Omit<AlertRule, "id" | "lastTriggered"> = {
  channels: [],
  metric: "success_rate",
  condition: "falls_below",
  threshold: 90,
  severity: "critical",
  actions: ["in_app"],
  enabled: true,
  label: "",
};

export function AlertRulesTab() {
  // Atomic selectors — one per slice.
  const alertRules = useMonitorStore.use.alertRules();
  const channelStatuses = useMonitorStore.use.channelStatuses();
  const addRule = useMonitorStore.use.addRule();
  const updateRule = useMonitorStore.use.updateRule();
  const deleteRule = useMonitorStore.use.deleteRule();
  const testAlert = useMonitorStore.use.testAlert();

  const ai = useAI();
  const [form, setForm] = useState<Omit<AlertRule, "id" | "lastTriggered">>({ ...EMPTY_RULE });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<ThresholdSuggestion | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!form.label.trim()) return;
    if (editingId) {
      updateRule(editingId, { ...form });
      setEditingId(null);
    } else {
      addRule({ ...form, id: `rule-${Date.now()}`, lastTriggered: null });
    }
    setForm({ ...EMPTY_RULE });
  };

  const handleEdit = (rule: AlertRule) => {
    setEditingId(rule.id);
    setForm({
      channels: rule.channels,
      metric: rule.metric,
      condition: rule.condition,
      threshold: rule.threshold,
      severity: rule.severity,
      actions: rule.actions,
      enabled: rule.enabled,
      label: rule.label,
    });
  };

  const handleSmartSuggestions = async () => {
    setAiLoading(true);
    setAiSuggestion(null);
    setAiError(null);
    try {
      const { system, prompt } = buildSuggestionPrompt(Object.values(channelStatuses));
      // Grammar-valid JSON by construction — no regex/parseJSON repair loop,
      // no direct web-llm. Runs offline via the provider registry (llamacpp).
      const result = await ai.generateStructured(
        { system, prompt, maxTokens: 300, temperature: 0.2 },
        ThresholdSuggestionSchema,
      );
      setAiSuggestion(result);
    } catch {
      setAiError("On-device model unavailable — adjust thresholds manually.");
    } finally {
      setAiLoading(false);
    }
  };

  const applySuggestion = (s: ThresholdSuggestion) => {
    setForm((f) => ({
      ...f,
      metric: "success_rate",
      condition: "falls_below",
      threshold: Math.round(s.successRateBelow),
      label: f.label || `Success rate falls below ${Math.round(s.successRateBelow)}%`,
    }));
  };

  const toggleAction = (action: AlertAction) => {
    setForm((f) => ({
      ...f,
      actions: f.actions.includes(action)
        ? f.actions.filter((a) => a !== action)
        : [...f.actions, action],
    }));
  };

  return (
    <div className="space-y-6">
      {/* Rule form */}
      <Card className="bg-slate-900/80 border-slate-800">
        <CardHeader>
          <CardTitle className="text-slate-100 text-base">
            {editingId ? "Edit Rule" : "New Alert Rule"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-xs text-slate-400 block mb-1">Rule Label</label>
              <input
                className="w-full rounded-md bg-slate-800 border border-slate-700 text-slate-200 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-600"
                placeholder="e.g. Success rate falls below 90%"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">Channels</label>
              <select
                multiple
                className="w-full rounded-md bg-slate-800 border border-slate-700 text-slate-200 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-600 h-24"
                value={form.channels.length === 0 ? ["__all__"] : form.channels}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions, (o) => o.value);
                  setForm((f) => ({
                    ...f,
                    channels: values.includes("__all__") ? [] : values,
                  }));
                }}
              >
                <option value="__all__">All Channels</option>
                {CHANNELS.map((ch) => (
                  <option key={ch.key} value={ch.key}>
                    {ch.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">Metric</label>
              <select
                className="w-full rounded-md bg-slate-800 border border-slate-700 text-slate-200 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-600"
                value={form.metric}
                onChange={(e) => setForm((f) => ({ ...f, metric: e.target.value as AlertMetric }))}
              >
                <option value="success_rate">Success Rate</option>
                <option value="volume">Volume</option>
                <option value="failure_count">Failure Count</option>
                <option value="avg_amount">Average Amount</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">Condition</label>
              <select
                className="w-full rounded-md bg-slate-800 border border-slate-700 text-slate-200 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-600"
                value={form.condition}
                onChange={(e) =>
                  setForm((f) => ({ ...f, condition: e.target.value as AlertCondition }))
                }
              >
                <option value="falls_below">Falls below</option>
                <option value="exceeds">Exceeds</option>
                <option value="equals">Equals</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">Threshold</label>
              <input
                type="number"
                className="w-full rounded-md bg-slate-800 border border-slate-700 text-slate-200 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-600"
                value={form.threshold}
                onChange={(e) => setForm((f) => ({ ...f, threshold: Number(e.target.value) }))}
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">Severity</label>
              <select
                className="w-full rounded-md bg-slate-800 border border-slate-700 text-slate-200 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-600"
                value={form.severity}
                onChange={(e) =>
                  setForm((f) => ({ ...f, severity: e.target.value as AlertSeverity }))
                }
              >
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-2">Actions</label>
              <div className="flex gap-4">
                {(["in_app", "sound"] as AlertAction[]).map((a) => (
                  <label
                    key={a}
                    className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="accent-slate-500"
                      checked={form.actions.includes(a)}
                      onChange={() => toggleAction(a)}
                    />
                    {a === "in_app" ? "In-App" : "Sound"}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-xs text-slate-400">Enabled</label>
              <Switch
                checked={form.enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
              />
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={handleSubmit} disabled={!form.label.trim()}>
              {editingId ? "Save Changes" : "Add Rule"}
            </Button>
            {editingId && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditingId(null);
                  setForm({ ...EMPTY_RULE });
                }}
              >
                Cancel
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleSmartSuggestions}
              disabled={aiLoading}
              className="ml-auto"
            >
              {aiLoading ? "Thinking…" : "Smart Suggestions (AI)"}
            </Button>
          </div>

          {aiError && (
            <div className="rounded-md bg-slate-800/60 border border-slate-700 px-3 py-2 text-xs text-slate-400">
              {aiError}
            </div>
          )}

          {aiSuggestion && (
            <div className="rounded-md bg-slate-800/60 border border-blue-500/20 px-3 py-2.5 text-xs text-slate-300 space-y-2">
              <div className="text-blue-400 font-semibold">AI Suggested Thresholds</div>
              <div className="grid grid-cols-3 gap-2">
                <Metric
                  label="Success rate <"
                  value={`${fmtN(aiSuggestion.successRateBelow, 1)}%`}
                />
                <Metric label="Volume >" value={fmtN(aiSuggestion.volumeAbove)} />
                <Metric label="Failures >" value={fmtN(aiSuggestion.failuresAbove)} />
              </div>
              <p className="text-slate-400">{aiSuggestion.rationale}</p>
              <Button size="xs" variant="outline" onClick={() => applySuggestion(aiSuggestion)}>
                Apply to form
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rules table */}
      <Card className="bg-slate-900/80 border-slate-800">
        <CardHeader>
          <CardTitle className="text-slate-100 text-base">Configured Rules</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500 text-xs">
                  <th className="px-4 py-2 text-left font-medium">Label</th>
                  <th className="px-4 py-2 text-left font-medium">Metric</th>
                  <th className="px-4 py-2 text-left font-medium">Condition</th>
                  <th className="px-4 py-2 text-left font-medium">Severity</th>
                  <th className="px-4 py-2 text-left font-medium">Last Triggered</th>
                  <th className="px-4 py-2 text-left font-medium">Enabled</th>
                  <th className="px-4 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {alertRules.map((rule) => (
                  <tr
                    key={rule.id}
                    className="border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-4 py-2.5 text-slate-200 font-medium">{rule.label}</td>
                    <td className="px-4 py-2.5 text-slate-400">{metricLabel(rule.metric)}</td>
                    <td className="px-4 py-2.5 text-slate-400">
                      {conditionLabel(rule.condition)} {fmtN(rule.threshold, 0)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-xs font-medium border",
                          severityBadgeClass(rule.severity),
                        )}
                      >
                        {rule.severity}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">
                      {rule.lastTriggered ? formatDateTime(rule.lastTriggered) : "Never"}
                    </td>
                    <td className="px-4 py-2.5">
                      <Switch
                        size="sm"
                        checked={rule.enabled}
                        onCheckedChange={(v) => updateRule(rule.id, { enabled: v })}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="xs" variant="ghost" onClick={() => testAlert(rule.id)}>
                          Test
                        </Button>
                        <Button size="xs" variant="outline" onClick={() => handleEdit(rule)}>
                          Edit
                        </Button>
                        <Button size="xs" variant="destructive" onClick={() => deleteRule(rule.id)}>
                          Del
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-900/60 rounded-md px-2 py-1.5 text-center">
      <div className="text-slate-500">{label}</div>
      <div className="text-slate-100 font-bold text-sm">{value}</div>
    </div>
  );
}
