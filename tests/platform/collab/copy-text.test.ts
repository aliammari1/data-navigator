import { afterEach, describe, expect, it, vi } from "vitest";
import { copyTextToClipboard } from "@/platform/collab/copy-text";
import { ClipboardTextSchema } from "../../../electron/ipc-validation";

describe("copyTextToClipboard", () => {
  afterEach(() => {
    delete (window as Window & { electronClipboard?: unknown }).electronClipboard;
    delete (document as Document & { execCommand?: unknown }).execCommand;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses Electron's native clipboard when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    (window as Window & { electronClipboard?: unknown }).electronClipboard = { writeText };
    const browserWrite = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { writeText: browserWrite } });

    await copyTextToClipboard("http://192.168.1.1:3000/guest/join");

    expect(writeText).toHaveBeenCalledWith("http://192.168.1.1:3000/guest/join");
    expect(browserWrite).not.toHaveBeenCalled();
  });

  it("uses browser clipboard when Electron is absent", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await copyTextToClipboard("invite");

    expect(writeText).toHaveBeenCalledWith("invite");
  });

  it("surfaces clipboard failures instead of reporting success", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    await expect(copyTextToClipboard("invite")).rejects.toThrow("denied");
  });

  it("copies with a temporary selection when browser Clipboard API is unavailable", async () => {
    vi.stubGlobal("navigator", {});
    const execCommand = vi.fn().mockReturnValue(true);
    Object.assign(document, { execCommand });

    await copyTextToClipboard("http://lan/guest/join");

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("falls back to a temporary selection when browser clipboard rejects", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.assign(document, { execCommand });

    await copyTextToClipboard("invite");

    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("rejects empty values and unavailable clipboards", async () => {
    await expect(copyTextToClipboard("")).rejects.toThrow("no text");
    vi.stubGlobal("navigator", {});
    await expect(copyTextToClipboard("invite")).rejects.toThrow("unavailable");
  });
});

describe("clipboard text IPC payload", () => {
  it("accepts links and rejects empty or oversized clipboard writes", () => {
    expect(ClipboardTextSchema.safeParse({ text: "http://lan/guest/join" }).success).toBe(true);
    expect(ClipboardTextSchema.safeParse({ text: "" }).success).toBe(false);
    expect(ClipboardTextSchema.safeParse({ text: "x".repeat(20_001) }).success).toBe(false);
  });
});
