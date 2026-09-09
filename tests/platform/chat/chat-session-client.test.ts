import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ChatModelUnavailableError,
  canUseChatSession,
  disposeChatSession,
  generateChatTitle,
  getChatSessionHistory,
  openChatSession,
  preloadChatPrompt,
  sendChatPrompt,
  suggestChatFollowUps,
} from "@/platform/chat/chat-session-client";

/**
 * Unit tests for the Moudir live chat-session renderer bridge client.
 *
 * Unlike chat-history-client.ts, this bridge is deliberately asymmetric per
 * its own doc comment:
 * - `sendChatPrompt` THROWS when the bridge is absent (chat is desktop-only).
 * - lifecycle helpers (dispose/preload) are null-safe no-ops.
 * - read helpers (history/title/followUps) return safe empty defaults.
 * These tests lock down both the "no bridge" fallbacks and the streaming/
 * abort wiring `sendChatPrompt` builds on top of `window.electronChatSession`.
 */

type Bridge = {
  open: ReturnType<typeof vi.fn>;
  prompt: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
  preload: ReturnType<typeof vi.fn>;
  history: ReturnType<typeof vi.fn>;
  title: ReturnType<typeof vi.fn>;
  followUps: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  onToken: ReturnType<typeof vi.fn>;
  onTool: ReturnType<typeof vi.fn>;
};

function installBridge(): Bridge {
  const bridge: Bridge = {
    open: vi.fn(),
    prompt: vi.fn(),
    abort: vi.fn(),
    preload: vi.fn(),
    history: vi.fn(),
    title: vi.fn(),
    followUps: vi.fn(),
    dispose: vi.fn(),
    onToken: vi.fn(() => vi.fn()),
    onTool: vi.fn(() => vi.fn()),
  };
  (window as unknown as { electronChatSession?: Bridge }).electronChatSession = bridge;
  return bridge;
}

describe("chat-session-client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    (window as unknown as { electronChatSession?: Bridge }).electronChatSession = undefined;
  });

  describe("canUseChatSession", () => {
    it("returns true when the bridge is present", () => {
      installBridge();
      expect(canUseChatSession()).toBe(true);
    });

    it("returns false when the bridge is absent", () => {
      expect(canUseChatSession()).toBe(false);
    });
  });

  describe("openChatSession", () => {
    it("forwards the input to the bridge and returns its result", async () => {
      const bridge = installBridge();
      bridge.open.mockResolvedValueOnce({ model: "gemma-4-e4b", reused: true });

      const result = await openChatSession({ conversationId: "c1" });

      expect(result).toEqual({ model: "gemma-4-e4b", reused: true });
      expect(bridge.open).toHaveBeenCalledWith({ conversationId: "c1" });
    });

    it("returns null when the bridge is absent", async () => {
      await expect(openChatSession({ conversationId: "c1" })).resolves.toBeNull();
    });

    it("wraps a 'Missing GGUF model' bridge rejection in ChatModelUnavailableError", async () => {
      const bridge = installBridge();
      bridge.open.mockRejectedValueOnce(
        new Error("Missing GGUF model: /tmp/missing.gguf. Download it while online."),
      );

      await expect(openChatSession({ conversationId: "c1" })).rejects.toBeInstanceOf(
        ChatModelUnavailableError,
      );
    });

    it("wraps a 'no offline model is ready' bridge rejection in ChatModelUnavailableError", async () => {
      const bridge = installBridge();
      bridge.open.mockRejectedValueOnce(new Error("no offline model is ready"));

      await expect(openChatSession({ conversationId: "c1" })).rejects.toBeInstanceOf(
        ChatModelUnavailableError,
      );
    });

    it("wraps an 'AI provider not available' bridge rejection in ChatModelUnavailableError", async () => {
      const bridge = installBridge();
      bridge.open.mockRejectedValueOnce(new Error('AI provider "llamacpp" is not available.'));

      await expect(openChatSession({ conversationId: "c1" })).rejects.toBeInstanceOf(
        ChatModelUnavailableError,
      );
    });

    it("passes through unrelated open rejections as their original error", async () => {
      const bridge = installBridge();
      const original = new Error("IPC channel closed mid-open");
      bridge.open.mockRejectedValueOnce(original);

      const caught = await openChatSession({ conversationId: "c1" }).catch((e) => e);
      expect(caught).toBe(original);
      expect(caught).not.toBeInstanceOf(ChatModelUnavailableError);
    });
  });

  describe("sendChatPrompt", () => {
    it("throws a clear error when the bridge is absent", async () => {
      await expect(sendChatPrompt({ conversationId: "c1", text: "salut" })).rejects.toThrow(
        /chat Moudir|electronChatSession/i,
      );
    });

    it("throws an AbortError immediately when the signal is already aborted, without calling the bridge", async () => {
      const bridge = installBridge();
      const controller = new AbortController();
      controller.abort();

      await expect(
        sendChatPrompt({ conversationId: "c1", text: "salut", signal: controller.signal }),
      ).rejects.toMatchObject({ name: "AbortError" });

      expect(bridge.prompt).not.toHaveBeenCalled();
      expect(bridge.onToken).not.toHaveBeenCalled();
      expect(bridge.onTool).not.toHaveBeenCalled();
    });

    it("subscribes token/tool listeners, forwards the prompt, and returns the bridge result", async () => {
      const bridge = installBridge();
      bridge.prompt.mockResolvedValueOnce({ text: "réponse", toolEvents: [] });
      const onToken = vi.fn();
      const onTool = vi.fn();

      const result = await sendChatPrompt({
        conversationId: "c1",
        text: "salut",
        onToken,
        onTool,
      });

      expect(result).toEqual({ text: "réponse", toolEvents: [] });
      expect(bridge.onToken).toHaveBeenCalledTimes(1);
      expect(bridge.onTool).toHaveBeenCalledTimes(1);
      const [tokenRequestId] = bridge.onToken.mock.calls[0];
      const [toolRequestId] = bridge.onTool.mock.calls[0];
      expect(tokenRequestId).toBe(toolRequestId);
      expect(bridge.prompt).toHaveBeenCalledWith({
        conversationId: "c1",
        text: "salut",
        requestId: tokenRequestId,
      });
    });

    it("does not subscribe onToken/onTool when the caller does not pass them", async () => {
      const bridge = installBridge();
      bridge.prompt.mockResolvedValueOnce({ text: "ok", toolEvents: [] });

      await sendChatPrompt({ conversationId: "c1", text: "salut" });

      expect(bridge.onToken).not.toHaveBeenCalled();
      expect(bridge.onTool).not.toHaveBeenCalled();
    });

    it("unsubscribes the token/tool listeners once the prompt settles", async () => {
      const bridge = installBridge();
      const unsubscribeToken = vi.fn();
      const unsubscribeTool = vi.fn();
      bridge.onToken.mockReturnValue(unsubscribeToken);
      bridge.onTool.mockReturnValue(unsubscribeTool);
      bridge.prompt.mockResolvedValueOnce({ text: "ok", toolEvents: [] });

      await sendChatPrompt({
        conversationId: "c1",
        text: "salut",
        onToken: vi.fn(),
        onTool: vi.fn(),
      });

      expect(unsubscribeToken).toHaveBeenCalledTimes(1);
      expect(unsubscribeTool).toHaveBeenCalledTimes(1);
    });

    it("unsubscribes the listeners even when the bridge prompt rejects", async () => {
      const bridge = installBridge();
      const unsubscribeToken = vi.fn();
      bridge.onToken.mockReturnValue(unsubscribeToken);
      bridge.prompt.mockRejectedValueOnce(new Error("modèle indisponible"));

      await expect(
        sendChatPrompt({ conversationId: "c1", text: "salut", onToken: vi.fn() }),
      ).rejects.toThrow("modèle indisponible");

      expect(unsubscribeToken).toHaveBeenCalledTimes(1);
    });

    it("calls bridge.abort with the request id when the signal fires mid-flight", async () => {
      const bridge = installBridge();
      let resolvePrompt!: (value: { text: string; toolEvents: never[] }) => void;
      bridge.prompt.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePrompt = resolve;
          }),
      );
      bridge.abort.mockResolvedValue(true);
      const controller = new AbortController();

      const pending = sendChatPrompt({
        conversationId: "c1",
        text: "salut",
        signal: controller.signal,
      });
      controller.abort();
      // Flush the abort listener's microtask (`void api.abort(requestId)`).
      await Promise.resolve();

      const requestId = bridge.prompt.mock.calls[0][0].requestId as string;
      expect(bridge.abort).toHaveBeenCalledWith(requestId);

      resolvePrompt({ text: "réponse", toolEvents: [] });
      await pending;
    });

    it("does not call bridge.abort if the signal fires after the prompt already settled", async () => {
      const bridge = installBridge();
      bridge.prompt.mockResolvedValueOnce({ text: "ok", toolEvents: [] });
      const controller = new AbortController();

      await sendChatPrompt({ conversationId: "c1", text: "salut", signal: controller.signal });
      controller.abort();

      expect(bridge.abort).not.toHaveBeenCalled();
    });

    it("wraps a 'Missing GGUF model' bridge rejection in ChatModelUnavailableError", async () => {
      const bridge = installBridge();
      bridge.prompt.mockRejectedValueOnce(
        new Error(
          "Missing GGUF model: <userData>/models/llm/gemma.gguf. Download it while online.",
        ),
      );

      await expect(sendChatPrompt({ conversationId: "c1", text: "salut" })).rejects.toBeInstanceOf(
        ChatModelUnavailableError,
      );
    });

    it("wraps a 'no offline model is ready' bridge rejection in ChatModelUnavailableError", async () => {
      const bridge = installBridge();
      bridge.prompt.mockRejectedValueOnce(new Error("no offline model is ready"));

      await expect(sendChatPrompt({ conversationId: "c1", text: "salut" })).rejects.toBeInstanceOf(
        ChatModelUnavailableError,
      );
    });

    it("wraps an 'AI provider not available' bridge rejection in ChatModelUnavailableError", async () => {
      const bridge = installBridge();
      bridge.prompt.mockRejectedValueOnce(new Error('AI provider "llamacpp" is not available.'));

      await expect(sendChatPrompt({ conversationId: "c1", text: "salut" })).rejects.toBeInstanceOf(
        ChatModelUnavailableError,
      );
    });

    it("preserves the original error message inside ChatModelUnavailableError", async () => {
      const bridge = installBridge();
      const original = "Missing GGUF model: /tmp/missing.gguf. Download it while online.";
      bridge.prompt.mockRejectedValueOnce(new Error(original));

      await expect(sendChatPrompt({ conversationId: "c1", text: "salut" })).rejects.toThrow(
        original,
      );
    });

    it("passes through unrelated bridge rejections as their original error (not ChatModelUnavailableError)", async () => {
      const bridge = installBridge();
      const original = new Error("DuckDB connection lost mid-stream");
      bridge.prompt.mockRejectedValueOnce(original);

      const caught = await sendChatPrompt({ conversationId: "c1", text: "salut" }).catch((e) => e);
      expect(caught).toBe(original);
      expect(caught).not.toBeInstanceOf(ChatModelUnavailableError);
    });

    it("does not wrap an AbortError as ChatModelUnavailableError", async () => {
      const bridge = installBridge();
      const controller = new AbortController();
      bridge.prompt.mockRejectedValueOnce(
        Object.assign(new Error("aborter"), { name: "AbortError" }),
      );

      const caught = await sendChatPrompt({
        conversationId: "c1",
        text: "salut",
        signal: controller.signal,
      }).catch((e) => e);
      expect(caught).not.toBeInstanceOf(ChatModelUnavailableError);
    });
  });

  describe("preloadChatPrompt", () => {
    it("forwards the conversationId and text to the bridge", async () => {
      const bridge = installBridge();
      await preloadChatPrompt("c1", "brouillon");
      expect(bridge.preload).toHaveBeenCalledWith({ conversationId: "c1", text: "brouillon" });
    });

    it("is a no-op when the bridge is absent", async () => {
      await expect(preloadChatPrompt("c1", "brouillon")).resolves.toBeUndefined();
    });
  });

  describe("getChatSessionHistory", () => {
    it("forwards the conversationId and returns the bridge's history", async () => {
      const bridge = installBridge();
      bridge.history.mockResolvedValueOnce([{ type: "user", text: "salut" }]);

      const result = await getChatSessionHistory("c1");

      expect(result).toEqual([{ type: "user", text: "salut" }]);
      expect(bridge.history).toHaveBeenCalledWith("c1");
    });

    it("returns [] when the bridge is absent", async () => {
      await expect(getChatSessionHistory("c1")).resolves.toEqual([]);
    });
  });

  describe("generateChatTitle", () => {
    it("forwards the conversationId and returns the generated title", async () => {
      const bridge = installBridge();
      bridge.title.mockResolvedValueOnce("Ventes par canal");

      const result = await generateChatTitle("c1");

      expect(result).toBe("Ventes par canal");
      expect(bridge.title).toHaveBeenCalledWith("c1");
    });

    it("returns null when the bridge is absent", async () => {
      await expect(generateChatTitle("c1")).resolves.toBeNull();
    });
  });

  describe("suggestChatFollowUps", () => {
    it("forwards the conversationId and returns the suggestions", async () => {
      const bridge = installBridge();
      bridge.followUps.mockResolvedValueOnce(["Et par région ?"]);

      const result = await suggestChatFollowUps("c1");

      expect(result).toEqual(["Et par région ?"]);
      expect(bridge.followUps).toHaveBeenCalledWith("c1");
    });

    it("returns [] when the bridge is absent", async () => {
      await expect(suggestChatFollowUps("c1")).resolves.toEqual([]);
    });
  });

  describe("disposeChatSession", () => {
    it("forwards the conversationId to the bridge", async () => {
      const bridge = installBridge();
      await disposeChatSession("c1");
      expect(bridge.dispose).toHaveBeenCalledWith("c1");
    });

    it("is a no-op when the bridge is absent", async () => {
      await expect(disposeChatSession("c1")).resolves.toBeUndefined();
    });
  });
});
