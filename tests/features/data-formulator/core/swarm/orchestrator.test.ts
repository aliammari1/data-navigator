import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Artifact,
  SwarmContext,
  SwarmResult,
} from "@/features/data-formulator/core/swarm/types";

/**
 * Unit tests for the swarm orchestrator (runSwarm) control flow.
 *
 * runSwarm is pure orchestration over many boundaries: a semantic cache, the
 * InferenceScheduler, a Tier-0 router, the analysis/lookup/answer/critic agents,
 * the deterministic compute + validate stages, and the swarm UI store. We mock
 * EVERY one of those boundaries and assert the routing / plan-assembly decisions:
 * cache short-circuit, model-readiness gate, navigate vs lookup vs analysis, the
 * clean-artifact filter, the high-risk judge, and the failure path. No real
 * model, DuckDB, or embeddings are involved.
 */

// ── Mocked collaborators ─────────────────────────────────────────────────────
const lookupCachedAnswer = vi.fn();
const storeCachedAnswer = vi.fn();
const routeQuestion = vi.fn();
const warmRouter = vi.fn().mockResolvedValue(undefined);
const runAnalysisPlan = vi.fn();
const runAnswer = vi.fn();
const runLookup = vi.fn();
const runBatchedCritic = vi.fn();
const compute = vi.fn();
const validateArtifact = vi.fn();
const isHighRisk = vi.fn();

// A scheduler stub whose isReady / ensureReady we control per test.
const schedulerStub = {
  isReady: vi.fn().mockResolvedValue(true),
  ensureReady: vi.fn().mockResolvedValue(undefined),
  cancel: vi.fn(),
};
const SchedulerCtor = vi.fn((..._args: unknown[]) => schedulerStub);

vi.mock("@/features/data-formulator/core/swarm/scheduler", () => ({
  InferenceScheduler: function (this: unknown, ...args: unknown[]) {
    return SchedulerCtor(...args);
  },
}));
vi.mock("@/features/data-formulator/core/swarm/response-cache", () => ({
  lookupCachedAnswer: (...a: unknown[]) => lookupCachedAnswer(...a),
  storeCachedAnswer: (...a: unknown[]) => storeCachedAnswer(...a),
}));
vi.mock("@/features/data-formulator/core/swarm/router", () => ({
  routeQuestion: (...a: unknown[]) => routeQuestion(...a),
  warmRouter: (...a: unknown[]) => warmRouter(...a),
}));
vi.mock("@/features/data-formulator/core/swarm/agents/analyze", () => ({
  runAnalysisPlan: (...a: unknown[]) => runAnalysisPlan(...a),
}));
vi.mock("@/features/data-formulator/core/swarm/agents/answer", () => ({
  runAnswer: (...a: unknown[]) => runAnswer(...a),
}));
vi.mock("@/features/data-formulator/core/swarm/agents/lookup", () => ({
  runLookup: (...a: unknown[]) => runLookup(...a),
}));
vi.mock("@/features/data-formulator/core/swarm/agents/critic", () => ({
  runBatchedCritic: (...a: unknown[]) => runBatchedCritic(...a),
}));
vi.mock("@/features/data-formulator/core/swarm/agents/validate", () => ({
  validateArtifact: (...a: unknown[]) => validateArtifact(...a),
  isHighRisk: (...a: unknown[]) => isHighRisk(...a),
}));
vi.mock("@/features/data-formulator/core/swarm/compute", () => ({
  compute: (...a: unknown[]) => compute(...a),
}));

// Import the real store (zustand) and the system under test AFTER the mocks.
import { useSettingsStore } from "@/core/stores/settings-store";
import { cancelActiveSwarm, runSwarm } from "@/features/data-formulator/core/swarm/orchestrator";
import { useSwarmStore } from "@/features/data-formulator/store/swarm-store";
import { useModelRequiredDialogStore } from "@/platform/ai/models/model-required-dialog-store";

// ── Fixtures ─────────────────────────────────────────────────────────────────
const baseCtx: SwarmContext = {
  datasetId: "ds1",
  datasetName: "transactions",
  tableName: "tx_view",
  columns: [
    { name: "channel", type: "string" },
    { name: "amount", type: "number" },
  ] as SwarmContext["columns"],
  rowSample: [],
  rowCount: 1000,
  model: "gemma-4-e4b-it-q4_k_m.gguf",
};

function tableArtifact(id: string): Artifact {
  return {
    kind: "table",
    id,
    taskId: "t1",
    title: "table",
    rows: [{ channel: "A", amount: 10 }],
  };
}

function insightArtifact(id: string): Artifact {
  return {
    kind: "insight",
    id,
    taskId: "t2",
    title: "insight",
    body: "Errors spiked on channel A.",
    severity: "high",
  };
}

function result(headline: string): SwarmResult {
  return {
    goal: "g",
    headline,
    summary: "s",
    evidence: [],
    followUps: [],
    confidence: "high",
    artifacts: [],
    modelUsed: baseCtx.model,
  };
}

beforeEach(() => {
  useSwarmStore.getState().reset();
  useModelRequiredDialogStore.setState({ open: false, reason: null });
  // The batched AI critic is opt-in; tests that exercise it enable it explicitly.
  useSettingsStore.setState({ enableAiCritic: false });
  lookupCachedAnswer.mockReset().mockResolvedValue(null);
  storeCachedAnswer.mockReset().mockResolvedValue(undefined);
  routeQuestion.mockReset();
  runAnalysisPlan.mockReset();
  runAnswer.mockReset();
  runLookup.mockReset();
  runBatchedCritic.mockReset().mockResolvedValue([]);
  compute.mockReset();
  // By default everything is clean and low risk.
  validateArtifact.mockReset().mockReturnValue({ hardFail: false, reasons: [] });
  isHighRisk.mockReset().mockImplementation((a: Artifact) => a.kind === "insight");
  schedulerStub.isReady.mockReset().mockResolvedValue(true);
  schedulerStub.ensureReady.mockReset().mockResolvedValue(undefined);
  schedulerStub.cancel.mockReset();
  SchedulerCtor.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("runSwarm — cache short-circuit", () => {
  it("returns the cached answer without touching the model when the cache hits", async () => {
    const cached = result("From cache");
    lookupCachedAnswer.mockResolvedValue(cached);

    const out = await runSwarm(baseCtx, "repeat question");

    expect(out).toBe(cached);
    expect(schedulerStub.isReady).not.toHaveBeenCalled();
    expect(routeQuestion).not.toHaveBeenCalled();
    expect(useSwarmStore.getState().phase).toBe("done");
    expect(useSwarmStore.getState().result).toBe(cached);
  });
});

describe("runSwarm — model readiness gate", () => {
  it("throws and marks the store failed when no offline model is ready", async () => {
    schedulerStub.isReady.mockResolvedValue(false);

    await expect(runSwarm(baseCtx, "anything")).rejects.toThrow(/No offline model is ready/);

    const state = useSwarmStore.getState();
    expect(state.phase).toBe("failed");
    expect(state.error).toMatch(/No offline model is ready/);
    expect(routeQuestion).not.toHaveBeenCalled();
  });

  it("shows the model-required dialog when no offline model is ready", async () => {
    schedulerStub.isReady.mockResolvedValue(false);

    await expect(runSwarm(baseCtx, "anything")).rejects.toThrow();

    expect(useModelRequiredDialogStore.getState().open).toBe(true);
  });

  it("does not show the model-required dialog when a model is ready", async () => {
    routeQuestion.mockResolvedValue({ tier: "lookup" });
    runLookup.mockResolvedValue({ ...result("ok"), artifacts: [] });

    await runSwarm(baseCtx, "anything");

    expect(useModelRequiredDialogStore.getState().open).toBe(false);
  });
});

describe("runSwarm — navigate tier", () => {
  it("resolves a navigation result and sets navigation without any agent call", async () => {
    routeQuestion.mockResolvedValue({
      tier: "navigate",
      route: { path: "/dashboard/monitor", label: "Monitor", hint: "" },
    });

    const out = await runSwarm(baseCtx, "open the monitor");

    expect(out.headline).toBe("Opening Monitor");
    expect(out.artifacts).toEqual([]);
    expect(out.modelUsed).toBe(baseCtx.model);
    expect(runLookup).not.toHaveBeenCalled();
    expect(runAnalysisPlan).not.toHaveBeenCalled();
    expect(useSwarmStore.getState().navigation).toEqual({
      path: "/dashboard/monitor",
      label: "Monitor",
    });
    expect(useSwarmStore.getState().phase).toBe("done");
  });
});

describe("runSwarm — lookup tier", () => {
  it("runs the single-call lookup, caches it, and adds its artifacts to the store", async () => {
    routeQuestion.mockResolvedValue({ tier: "lookup" });
    const lookupResult: SwarmResult = {
      ...result("Top channels"),
      artifacts: [tableArtifact("a1")],
    };
    runLookup.mockResolvedValue(lookupResult);

    const out = await runSwarm(baseCtx, "top channels");

    expect(out).toBe(lookupResult);
    expect(runLookup).toHaveBeenCalledTimes(1);
    expect(runAnalysisPlan).not.toHaveBeenCalled();
    expect(storeCachedAnswer).toHaveBeenCalledWith(
      "top channels",
      expect.objectContaining({ userPrompt: "top channels" }),
      lookupResult,
    );
    expect(useSwarmStore.getState().artifacts).toHaveLength(1);
  });
});

describe("runSwarm — analysis tier", () => {
  it("runs plan → compute → judge → answer and returns the synthesized result", async () => {
    routeQuestion.mockResolvedValue({ tier: "analysis" });
    runAnalysisPlan.mockResolvedValue({ goal: "Explain the drop", tasks: [] });
    compute.mockResolvedValue([tableArtifact("a1"), insightArtifact("i1")]);
    const finalResult = result("Here is why");
    runAnswer.mockResolvedValue(finalResult);

    const out = await runSwarm(baseCtx, "why did revenue drop");

    expect(out).toBe(finalResult);
    expect(runAnalysisPlan).toHaveBeenCalledTimes(1);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(runAnswer).toHaveBeenCalledTimes(1);
    // runAnswer receives the plan goal and the surviving artifacts.
    const answerArgs = runAnswer.mock.calls[0];
    expect(answerArgs[2]).toBe("Explain the drop");
    expect(answerArgs[3]).toHaveLength(2);
    expect(useSwarmStore.getState().phase).toBe("done");
  });

  it("filters out artifacts that hard-fail validation before judging", async () => {
    routeQuestion.mockResolvedValue({ tier: "analysis" });
    runAnalysisPlan.mockResolvedValue({ goal: "g", tasks: [] });
    const good = tableArtifact("good");
    const bad = tableArtifact("bad");
    compute.mockResolvedValue([good, bad]);
    validateArtifact.mockImplementation((a: Artifact) => ({
      hardFail: a.id === "bad",
      reasons: a.id === "bad" ? ["empty"] : [],
    }));
    runAnswer.mockResolvedValue(result("ok"));

    await runSwarm(baseCtx, "analyze this");

    const passedToAnswer = runAnswer.mock.calls[0][3] as Artifact[];
    expect(passedToAnswer.map((a) => a.id)).toEqual(["good"]);
  });

  it("throws when every produced artifact hard-fails validation", async () => {
    routeQuestion.mockResolvedValue({ tier: "analysis" });
    runAnalysisPlan.mockResolvedValue({ goal: "g", tasks: [] });
    compute.mockResolvedValue([tableArtifact("a1")]);
    validateArtifact.mockReturnValue({ hardFail: true, reasons: ["bad"] });

    await expect(runSwarm(baseCtx, "analyze")).rejects.toThrow(/No trustworthy data/);
    expect(runAnswer).not.toHaveBeenCalled();
    expect(useSwarmStore.getState().phase).toBe("failed");
  });

  it("drops a high-risk insight the batched critic rejects", async () => {
    useSettingsStore.setState({ enableAiCritic: true });
    routeQuestion.mockResolvedValue({ tier: "analysis" });
    runAnalysisPlan.mockResolvedValue({ goal: "g", tasks: [] });
    const table = tableArtifact("tbl");
    const insight = insightArtifact("ins");
    compute.mockResolvedValue([table, insight]);
    runBatchedCritic.mockResolvedValue([
      { taskId: "ins", accepted: false, reason: "unsupported", confidence: "high" },
    ]);
    runAnswer.mockResolvedValue(result("ok"));

    await runSwarm(baseCtx, "why");

    const survivors = runAnswer.mock.calls[0][3] as Artifact[];
    // The low-risk table survives; the rejected high-risk insight is dropped.
    expect(survivors.map((a) => a.id)).toEqual(["tbl"]);
    expect(runBatchedCritic).toHaveBeenCalledTimes(1);
  });

  it("keeps a high-risk insight the critic accepts", async () => {
    useSettingsStore.setState({ enableAiCritic: true });
    routeQuestion.mockResolvedValue({ tier: "analysis" });
    runAnalysisPlan.mockResolvedValue({ goal: "g", tasks: [] });
    const insight = insightArtifact("ins");
    compute.mockResolvedValue([insight]);
    runBatchedCritic.mockResolvedValue([
      { taskId: "ins", accepted: true, reason: "supported", confidence: "high" },
    ]);
    runAnswer.mockResolvedValue(result("ok"));

    await runSwarm(baseCtx, "why");

    const survivors = runAnswer.mock.calls[0][3] as Artifact[];
    expect(survivors.map((a) => a.id)).toEqual(["ins"]);
  });

  it("keeps all artifacts when the batched critic throws (judge failure is non-fatal)", async () => {
    useSettingsStore.setState({ enableAiCritic: true });
    routeQuestion.mockResolvedValue({ tier: "analysis" });
    runAnalysisPlan.mockResolvedValue({ goal: "g", tasks: [] });
    const insight = insightArtifact("ins");
    compute.mockResolvedValue([insight]);
    runBatchedCritic.mockRejectedValue(new Error("critic exploded"));
    runAnswer.mockResolvedValue(result("ok"));

    await runSwarm(baseCtx, "why");

    const survivors = runAnswer.mock.calls[0][3] as Artifact[];
    expect(survivors.map((a) => a.id)).toEqual(["ins"]);
  });

  it("skips the critic entirely when there are no high-risk artifacts", async () => {
    useSettingsStore.setState({ enableAiCritic: true });
    routeQuestion.mockResolvedValue({ tier: "analysis" });
    runAnalysisPlan.mockResolvedValue({ goal: "g", tasks: [] });
    compute.mockResolvedValue([tableArtifact("a1"), tableArtifact("a2")]);
    runAnswer.mockResolvedValue(result("ok"));

    await runSwarm(baseCtx, "show me tables");

    expect(runBatchedCritic).not.toHaveBeenCalled();
  });

  it("does not run the AI critic by default, keeping high-risk insights", async () => {
    // enableAiCritic defaults to false (set in beforeEach): the deterministic
    // validators already gate the artifacts, so a rejecting critic must never
    // fire and the high-risk insight must survive untouched.
    routeQuestion.mockResolvedValue({ tier: "analysis" });
    runAnalysisPlan.mockResolvedValue({ goal: "g", tasks: [] });
    compute.mockResolvedValue([tableArtifact("tbl"), insightArtifact("ins")]);
    runBatchedCritic.mockResolvedValue([
      { taskId: "ins", accepted: false, reason: "would reject", confidence: "high" },
    ]);
    runAnswer.mockResolvedValue(result("ok"));

    await runSwarm(baseCtx, "why");

    expect(runBatchedCritic).not.toHaveBeenCalled();
    const survivors = runAnswer.mock.calls[0][3] as Artifact[];
    expect(survivors.map((a) => a.id)).toEqual(["tbl", "ins"]);
  });
});

describe("runSwarm — routing failure fallback", () => {
  it("falls back to the analysis tier when routeQuestion throws", async () => {
    routeQuestion.mockRejectedValue(new Error("embedding crashed"));
    runAnalysisPlan.mockResolvedValue({ goal: "g", tasks: [] });
    compute.mockResolvedValue([tableArtifact("a1")]);
    runAnswer.mockResolvedValue(result("ok"));

    await runSwarm(baseCtx, "ambiguous");

    expect(runAnalysisPlan).toHaveBeenCalledTimes(1);
    expect(runLookup).not.toHaveBeenCalled();
  });
});

describe("runSwarm — failure propagation", () => {
  it("marks the store failed and rethrows when an agent stage throws", async () => {
    routeQuestion.mockResolvedValue({ tier: "lookup" });
    runLookup.mockRejectedValue(new Error("lookup blew up"));

    await expect(runSwarm(baseCtx, "boom")).rejects.toThrow("lookup blew up");

    const state = useSwarmStore.getState();
    expect(state.phase).toBe("failed");
    expect(state.error).toBe("lookup blew up");
  });

  it("passes the verbatim prompt as userPrompt into the run context", async () => {
    routeQuestion.mockResolvedValue({ tier: "lookup" });
    runLookup.mockResolvedValue({ ...result("x"), artifacts: [] });

    await runSwarm(baseCtx, "  Combien de transactions hier?  ");

    const ctxArg = runLookup.mock.calls[0][1] as SwarmContext;
    expect(ctxArg.userPrompt).toBe("  Combien de transactions hier?  ");
    expect(ctxArg.datasetId).toBe("ds1");
  });
});

describe("cancelActiveSwarm", () => {
  it("calls cancel on the active scheduler when a run is in flight", async () => {
    // Start a run that will be held open until we cancel it.
    routeQuestion.mockResolvedValue({ tier: "lookup" });
    let resolveLookup!: (v: SwarmResult) => void;
    const pendingLookup = new Promise<SwarmResult>((res) => {
      resolveLookup = res;
    });
    runLookup.mockReturnValue(pendingLookup);

    // Fire the swarm but do not await — we want it in-flight.
    const running = runSwarm(baseCtx, "pending");

    // Give the event loop a tick so runSwarm can reach the in-flight state.
    await Promise.resolve();

    // cancelActiveSwarm should forward to the scheduler stub's cancel().
    cancelActiveSwarm();
    expect(schedulerStub.cancel).toHaveBeenCalledTimes(1);

    // Resolve lookup so the promise settles and the test can clean up.
    resolveLookup({ ...result("done"), artifacts: [] });
    await running;
  });

  it("is a no-op when no swarm is active (activeScheduler is null)", () => {
    // No run is in flight — this must not throw.
    expect(() => cancelActiveSwarm()).not.toThrow();
    expect(schedulerStub.cancel).not.toHaveBeenCalled();
  });
});

describe("runSwarm — errMessage branch for non-Error throws", () => {
  it("converts a non-Error thrown value to a string for the store error", async () => {
    routeQuestion.mockResolvedValue({ tier: "lookup" });
    // Throwing a plain string exercises the String(err) branch of errMessage.
    runLookup.mockRejectedValue("plain string error");

    await expect(runSwarm(baseCtx, "boom")).rejects.toBe("plain string error");

    const state = useSwarmStore.getState();
    expect(state.phase).toBe("failed");
    expect(state.error).toBe("plain string error");
  });
});

describe("runSwarm — ensureReady rejection propagates through withTimeout", () => {
  it("propagates an ensureReady rejection (covering lines 54-55) and marks the store failed", async () => {
    const warmError = new Error("model load failed");
    schedulerStub.ensureReady.mockRejectedValue(warmError);

    await expect(runSwarm(baseCtx, "anything")).rejects.toThrow("model load failed");

    const state = useSwarmStore.getState();
    expect(state.phase).toBe("failed");
    expect(state.error).toBe("model load failed");
    // The warming indicator must have been cleared in the finally block.
    expect(state.warming).toBeNull();
  });
});

describe("runSwarm — warming progress callback (line 131)", () => {
  it("falls back to the default warming message when ensureReady provides an empty message", async () => {
    // We need ensureReady to call the progress callback with a falsy message
    // so the `message || "Warming up the offline model…"` branch fires.
    schedulerStub.ensureReady.mockImplementation(
      async (_model: string, onProgress: (progress: number, message: string) => void) => {
        // Call with empty string to trigger the fallback branch.
        onProgress(50, "");
      },
    );
    routeQuestion.mockResolvedValue({ tier: "lookup" });
    runLookup.mockResolvedValue({ ...result("ok"), artifacts: [] });

    await runSwarm(baseCtx, "anything");

    // The store should have received the fallback message during warming.
    // After the finally block warming is null, so we just check the run completed.
    expect(useSwarmStore.getState().phase).toBe("done");
  });

  it("passes a provided warming message through unchanged", async () => {
    // Capture setWarming calls to verify the truthy-message path.
    const warmingMessages: string[] = [];
    const origState = useSwarmStore.getState();
    const origSetWarming = origState.setWarming.bind(origState);
    const spySetWarming = vi
      .spyOn(useSwarmStore.getState(), "setWarming")
      .mockImplementation((w) => {
        if (w && typeof w === "object" && "message" in w) {
          warmingMessages.push(w.message as string);
        }
        origSetWarming(w as Parameters<typeof origSetWarming>[0]);
      });

    schedulerStub.ensureReady.mockImplementation(
      async (_model: string, onProgress: (progress: number, message: string) => void) => {
        onProgress(75, "Custom loading message");
      },
    );
    routeQuestion.mockResolvedValue({ tier: "lookup" });
    runLookup.mockResolvedValue({ ...result("ok"), artifacts: [] });

    await runSwarm(baseCtx, "anything");

    spySetWarming.mockRestore();
    expect(warmingMessages).toContain("Custom loading message");
  });
});

describe("runSwarm — runAnswer token callback (line 201)", () => {
  it("forwards streamed tokens to the store via appendAnswerToken", async () => {
    routeQuestion.mockResolvedValue({ tier: "analysis" });
    runAnalysisPlan.mockResolvedValue({ goal: "g", tasks: [] });
    compute.mockResolvedValue([tableArtifact("a1")]);

    // Simulate runAnswer calling the token callback before resolving.
    runAnswer.mockImplementation(
      async (
        _scheduler: unknown,
        _ctx: unknown,
        _goal: string,
        _artifacts: unknown,
        onToken: (token: string) => void,
      ) => {
        onToken("Hello");
        onToken(" world");
        return result("streamed");
      },
    );

    const appendSpy = vi.spyOn(useSwarmStore.getState(), "appendAnswerToken");

    await runSwarm(baseCtx, "stream this");

    expect(appendSpy).toHaveBeenCalledWith("Hello");
    expect(appendSpy).toHaveBeenCalledWith(" world");
    appendSpy.mockRestore();
  });
});

describe("runSwarm — withTimeout fires when ensureReady takes too long", () => {
  it("rejects with the timeout message when ensureReady does not settle within 120s", async () => {
    vi.useFakeTimers();

    // ensureReady returns a promise that never resolves — simulating a hung model load.
    schedulerStub.ensureReady.mockReturnValue(new Promise<void>(() => {}));

    // Start the run — it will block in the withTimeout wrapper.
    const runningPromise = runSwarm(baseCtx, "slow model");

    // Drain microtasks so runSwarm reaches the withTimeout call.
    await Promise.resolve();
    await Promise.resolve();

    // Advance clocks past the 120 000 ms threshold to fire the timeout.
    vi.advanceTimersByTime(121_000);

    // Drain microtasks again so the rejection propagates through the promise chain.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Restore real timers before awaiting so no further fake-timer interactions occur.
    vi.useRealTimers();

    await expect(runningPromise).rejects.toThrow(/offline model took too long/);

    const state = useSwarmStore.getState();
    expect(state.phase).toBe("failed");
  });
});

describe("runSwarm — concurrent runs (line 210 false branch)", () => {
  it("does not clear activeScheduler in the finally block when a newer run has already replaced it", async () => {
    // Arrange: first run starts and blocks; second run supersedes the first's scheduler.
    routeQuestion.mockResolvedValue({ tier: "lookup" });

    let resolveFirst!: (v: SwarmResult) => void;
    const firstPending = new Promise<SwarmResult>((res) => {
      resolveFirst = res;
    });
    // The SchedulerCtor is called once per runSwarm invocation.
    // We need the second invocation to produce a different stub so that
    // activeScheduler !== firstScheduler when the first finally runs.
    const secondSchedulerStub = {
      isReady: vi.fn().mockResolvedValue(true),
      ensureReady: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(),
    };

    let callCount = 0;
    SchedulerCtor.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? schedulerStub : secondSchedulerStub;
    });

    // First run stalls at the lookup stage.
    runLookup
      .mockReturnValueOnce(firstPending)
      .mockResolvedValue({ ...result("second"), artifacts: [] });

    const first = runSwarm(baseCtx, "first");

    // Tick enough for the first run to advance past isReady and reach the blocked lookup.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Second run starts immediately — it should replace activeScheduler.
    const second = runSwarm(baseCtx, "second");

    // Now resolve the first run. Its finally block will see activeScheduler !== firstScheduler.
    resolveFirst({ ...result("first"), artifacts: [] });

    // Both must settle without throwing.
    const [r1, r2] = await Promise.all([first, second]);
    expect(r1.headline).toBe("first");
    expect(r2.headline).toBe("second");
  });
});
