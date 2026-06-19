import { describe, expect, it } from "vitest";
import {
  FIRE_COOLDOWN_MS,
  evaluateRules,
} from "@/features/channel-monitor/lib/engine-core";
import type {
  AlertRule,
  ChannelStatus,
} from "@/features/channel-monitor/store/monitor-store";

/**
 * Unit tests for the deterministic alert-rule evaluation engine.
 *
 * `evaluateRules` is a pure function of (statuses, rules, lastFired, now). It is
 * the SLA/threshold heart of the channel monitor, so these tests exercise the
 * metric derivation, condition operators, channel scoping, the enabled gate and
 * the per-(rule, channel) cooldown debounce.
 */

const NOW = Date.UTC(2026, 5, 16, 12, 0, 0); // fixed injected clock

function makeStatus(over: Partial<ChannelStatus> = {}): ChannelStatus {
  return {
    channel: "bill_payment",
    displayName: "Bill Payment",
    health: "healthy",
    successRate: 99,
    txnPerMin: 100,
    amountToday: 6_000_000,
    failureCount: 10,
    trend: "stable",
    lastIncident: null,
    lastIncidentAt: null,
    updatedAt: new Date(NOW).toISOString(),
    ...over,
  };
}

function makeRule(over: Partial<AlertRule> = {}): AlertRule {
  return {
    id: "rule-1",
    channels: [],
    metric: "success_rate",
    condition: "falls_below",
    threshold: 90,
    severity: "critical",
    actions: ["in_app"],
    enabled: true,
    lastTriggered: null,
    label: "Success rate falls below 90%",
    ...over,
  };
}

describe("evaluateRules — basic firing", () => {
  it("fires when success_rate falls below the threshold", () => {
    // Arrange
    const statuses = [makeStatus({ successRate: 80 })];
    const rules = [makeRule({ threshold: 90, condition: "falls_below" })];

    // Act
    const fired = evaluateRules(statuses, rules, new Map(), NOW);

    // Assert
    expect(fired).toHaveLength(1);
    expect(fired[0].event.ruleId).toBe("rule-1");
    expect(fired[0].event.channel).toBe("bill_payment");
    expect(fired[0].event.actualValue).toBe(80);
    expect(fired[0].event.threshold).toBe(90);
    expect(fired[0].event.severity).toBe("critical");
  });

  it("does not fire when the metric is at or above the falls_below threshold", () => {
    const statuses = [makeStatus({ successRate: 90 })];
    const rules = [makeRule({ threshold: 90, condition: "falls_below" })];

    const fired = evaluateRules(statuses, rules, new Map(), NOW);

    expect(fired).toEqual([]);
  });

  it("returns an empty array when there are no rules", () => {
    const fired = evaluateRules([makeStatus()], [], new Map(), NOW);
    expect(fired).toEqual([]);
  });

  it("returns an empty array when there are no statuses", () => {
    const fired = evaluateRules([], [makeRule()], new Map(), NOW);
    expect(fired).toEqual([]);
  });
});

describe("evaluateRules — condition operators", () => {
  it("exceeds fires strictly above the threshold but not at it", () => {
    const rules = [
      makeRule({ metric: "failure_count", condition: "exceeds", threshold: 500 }),
    ];

    const above = evaluateRules(
      [makeStatus({ failureCount: 501 })],
      rules,
      new Map(),
      NOW,
    );
    const at = evaluateRules(
      [makeStatus({ failureCount: 500 })],
      rules,
      new Map(),
      NOW,
    );

    expect(above).toHaveLength(1);
    expect(at).toEqual([]);
  });

  it("equals fires within a 0.5 tolerance window and not outside it", () => {
    const rules = [
      makeRule({ metric: "failure_count", condition: "equals", threshold: 100 }),
    ];

    const inside = evaluateRules(
      [makeStatus({ failureCount: 100.4 })],
      rules,
      new Map(),
      NOW,
    );
    const outside = evaluateRules(
      [makeStatus({ failureCount: 100.6 })],
      rules,
      new Map(),
      NOW,
    );

    expect(inside).toHaveLength(1);
    expect(outside).toEqual([]);
  });

  it("ignores an unknown condition (defaults to not met)", () => {
    const rules = [
      makeRule({ condition: "weird_op" as AlertRule["condition"] }),
    ];

    const fired = evaluateRules(
      [makeStatus({ successRate: 0 })],
      rules,
      new Map(),
      NOW,
    );

    expect(fired).toEqual([]);
  });
});

describe("evaluateRules — metric derivation", () => {
  it("derives volume as txnPerMin * 60 (per-hour)", () => {
    const rules = [
      makeRule({ metric: "volume", condition: "exceeds", threshold: 15000 }),
    ];
    // 300 * 60 = 18000 > 15000
    const fired = evaluateRules(
      [makeStatus({ txnPerMin: 300 })],
      rules,
      new Map(),
      NOW,
    );

    expect(fired).toHaveLength(1);
    expect(fired[0].event.actualValue).toBe(18000);
  });

  it("derives avg_amount as amountToday / max(1, txnPerMin*60)", () => {
    const rules = [
      makeRule({ metric: "avg_amount", condition: "exceeds", threshold: 0 }),
    ];
    // amountToday 12000, txnPerMin 100 -> /6000 = 2
    const fired = evaluateRules(
      [makeStatus({ amountToday: 12000, txnPerMin: 100 })],
      rules,
      new Map(),
      NOW,
    );

    expect(fired[0].event.actualValue).toBeCloseTo(2, 5);
  });

  it("guards avg_amount against a divide-by-zero when there is no volume", () => {
    const rules = [
      makeRule({ metric: "avg_amount", condition: "exceeds", threshold: 0 }),
    ];
    // txnPerMin 0 -> max(1, 0) = 1 denominator, so value == amountToday
    const fired = evaluateRules(
      [makeStatus({ amountToday: 5000, txnPerMin: 0 })],
      rules,
      new Map(),
      NOW,
    );

    expect(fired[0].event.actualValue).toBe(5000);
    expect(Number.isFinite(fired[0].event.actualValue)).toBe(true);
  });

  it("treats an unknown metric as 0", () => {
    const rules = [
      makeRule({
        metric: "unknown_metric" as AlertRule["metric"],
        condition: "exceeds",
        threshold: -1,
      }),
    ];
    // unknown metric -> 0; 0 > -1 fires
    const fired = evaluateRules([makeStatus()], rules, new Map(), NOW);

    expect(fired).toHaveLength(1);
    expect(fired[0].event.actualValue).toBe(0);
  });
});

describe("evaluateRules — enabled gate and channel scoping", () => {
  it("skips disabled rules entirely", () => {
    const rules = [
      makeRule({ enabled: false, threshold: 100, condition: "falls_below" }),
    ];

    const fired = evaluateRules(
      [makeStatus({ successRate: 10 })],
      rules,
      new Map(),
      NOW,
    );

    expect(fired).toEqual([]);
  });

  it("applies to all channels when the rule channel list is empty", () => {
    const statuses = [
      makeStatus({ channel: "a", successRate: 10 }),
      makeStatus({ channel: "b", successRate: 10 }),
    ];
    const rules = [makeRule({ channels: [], threshold: 90 })];

    const fired = evaluateRules(statuses, rules, new Map(), NOW);

    expect(fired.map((f) => f.event.channel).sort()).toEqual(["a", "b"]);
  });

  it("only fires for channels listed in a scoped rule", () => {
    const statuses = [
      makeStatus({ channel: "a", successRate: 10 }),
      makeStatus({ channel: "b", successRate: 10 }),
    ];
    const rules = [makeRule({ channels: ["b"], threshold: 90 })];

    const fired = evaluateRules(statuses, rules, new Map(), NOW);

    expect(fired).toHaveLength(1);
    expect(fired[0].event.channel).toBe("b");
  });
});

describe("evaluateRules — cooldown debounce", () => {
  it("does not re-fire the same rule+channel within the cooldown window", () => {
    const statuses = [makeStatus({ successRate: 10 })];
    const rules = [makeRule({ threshold: 90 })];
    const lastFired = new Map<string, number>([
      ["rule-1:bill_payment", NOW - 1000], // 1s ago, well within cooldown
    ]);

    const fired = evaluateRules(statuses, rules, lastFired, NOW);

    expect(fired).toEqual([]);
  });

  it("re-fires once the cooldown window has fully elapsed", () => {
    const statuses = [makeStatus({ successRate: 10 })];
    const rules = [makeRule({ threshold: 90 })];
    const lastFired = new Map<string, number>([
      ["rule-1:bill_payment", NOW - FIRE_COOLDOWN_MS - 1],
    ]);

    const fired = evaluateRules(statuses, rules, lastFired, NOW);

    expect(fired).toHaveLength(1);
  });

  it("records the fire time into the lastFired map (mutation contract)", () => {
    const statuses = [makeStatus({ successRate: 10 })];
    const rules = [makeRule({ threshold: 90 })];
    const lastFired = new Map<string, number>();

    evaluateRules(statuses, rules, lastFired, NOW);

    expect(lastFired.get("rule-1:bill_payment")).toBe(NOW);
  });

  it("debounces a second pass with the same map at the same instant", () => {
    const statuses = [makeStatus({ successRate: 10 })];
    const rules = [makeRule({ threshold: 90 })];
    const lastFired = new Map<string, number>();

    const first = evaluateRules(statuses, rules, lastFired, NOW);
    const second = evaluateRules(statuses, rules, lastFired, NOW);

    expect(first).toHaveLength(1);
    expect(second).toEqual([]);
  });
});

describe("evaluateRules — emitted event/notification shape", () => {
  it("builds a deterministic event id, ISO timestamp and channel-labelled notification", () => {
    const statuses = [makeStatus({ channel: "bill_payment", successRate: 12.34 })];
    const rules = [makeRule({ id: "r9", threshold: 90, label: "SR low" })];

    const fired = evaluateRules(statuses, rules, new Map(), NOW);
    const { event, notification } = fired[0];

    expect(event.id).toBe(`auto-${NOW}-r9-bill_payment`);
    expect(event.triggeredAt).toBe(new Date(NOW).toISOString());
    expect(event.acknowledged).toBe(false);
    expect(notification.id).toBe(`notif-${event.id}`);
    expect(notification.read).toBe(false);
    // friendly channel label + one-decimal value
    expect(notification.message).toBe("SR low — Bill Payment (12.3)");
  });

  it("falls back to the raw channel key in the notification when unlabelled", () => {
    const statuses = [makeStatus({ channel: "made_up_channel", successRate: 12 })];
    const rules = [makeRule({ threshold: 90, label: "SR low" })];

    const fired = evaluateRules(statuses, rules, new Map(), NOW);

    expect(fired[0].notification.message).toBe("SR low — made_up_channel (12.0)");
  });
});
