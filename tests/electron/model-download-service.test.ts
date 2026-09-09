import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression tests for the model-download in-flight dedup.
 *
 * Context: closing the model-required dialog only tears down the renderer's
 * progress listener (useModelStatus's unmount effect), it never aborts the
 * download. If the dialog is reopened and Download is clicked again while
 * the first attempt is still running, a naive implementation would spin up a
 * SECOND `createModelDownloader` against the same destination file — a race
 * that can corrupt the partial file. `downloadModel` must instead attach the
 * second caller to the same in-flight download and sync it to the current
 * progress immediately, so the UI resumes mid-download rather than
 * restarting from 0%.
 */

const { createModelDownloaderMock, holder } = vi.hoisted(() => ({
  createModelDownloaderMock: vi.fn(),
  holder: { userDataDir: "" },
}));

vi.mock("node-llama-cpp", () => ({ createModelDownloader: createModelDownloaderMock }));
vi.mock("electron", () => ({ app: { getPath: () => holder.userDataDir } }));

const USER_DATA_DIR = path.join(os.tmpdir(), "dn-model-download-service-test");
const MODEL_KEY = "gemma-4-e2b-qat-mobile-text-only";

holder.userDataDir = USER_DATA_DIR;

/** A controllable stand-in for node-llama-cpp's ModelDownloader. */
function makeControllableDownloader() {
  const cancel = vi.fn().mockResolvedValue(undefined);
  let settle: (() => void) | undefined;
  let fail: ((err: unknown) => void) | undefined;
  const download = vi.fn(({ signal }: { signal: AbortSignal }) => {
    return new Promise<void>((resolve, reject) => {
      settle = resolve;
      fail = reject;
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
  });
  return {
    downloader: { download, cancel },
    finish: () => settle?.(),
    reject: (err: unknown) => fail?.(err),
  };
}

describe("model-download-service in-flight dedup", () => {
  beforeEach(() => {
    vi.resetModules();
    createModelDownloaderMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("attaches a second caller to the same download instead of starting a duplicate", async () => {
    const { downloader } = makeControllableDownloader();
    createModelDownloaderMock.mockResolvedValue(downloader);
    const { downloadModel } = await import("../../electron/model-download-service");

    const cb1 = vi.fn();
    const cb2 = vi.fn();
    void downloadModel({ key: MODEL_KEY, onProgress: cb1 });
    // Wait until the first call's async setup (dynamic import +
    // createModelDownloader) has settled. downloader.download() is invoked in
    // the same synchronous block that registers the in-flight map entry, so
    // once it has been called the second call is guaranteed to see the entry.
    await vi.waitFor(() => expect(downloader.download).toHaveBeenCalledTimes(1));
    void downloadModel({ key: MODEL_KEY, onProgress: cb2 });

    expect(createModelDownloaderMock).toHaveBeenCalledTimes(1);

    const onProgress = createModelDownloaderMock.mock.calls[0][0].onProgress;
    onProgress({ totalSize: 1000, downloadedSize: 500 });

    expect(cb1).toHaveBeenCalledWith(expect.objectContaining({ percent: 50 }));
    expect(cb2).toHaveBeenCalledWith(expect.objectContaining({ percent: 50 }));
  });

  it("syncs a late-attaching caller to the current progress instead of 0%", async () => {
    const { downloader } = makeControllableDownloader();
    createModelDownloaderMock.mockResolvedValue(downloader);
    const { downloadModel } = await import("../../electron/model-download-service");

    void downloadModel({ key: MODEL_KEY, onProgress: vi.fn() });
    // download() being called guarantees the in-flight entry is registered.
    await vi.waitFor(() => expect(downloader.download).toHaveBeenCalledTimes(1));

    const onProgress = createModelDownloaderMock.mock.calls[0][0].onProgress;
    onProgress({ totalSize: 1000, downloadedSize: 700 });

    const cbLate = vi.fn();
    void downloadModel({ key: MODEL_KEY, onProgress: cbLate });

    // Attaching should synchronously replay the last known progress, before
    // any new progress tick — this is what makes "click Download again" show
    // the real current percentage instead of restarting from 0%.
    expect(cbLate).toHaveBeenCalledWith(expect.objectContaining({ percent: 70 }));
    expect(cbLate).not.toHaveBeenCalledWith(expect.objectContaining({ percent: 0 }));
  });

  it("resolves every attached caller once the shared download finishes", async () => {
    const { downloader, finish } = makeControllableDownloader();
    createModelDownloaderMock.mockResolvedValue(downloader);
    const { downloadModel } = await import("../../electron/model-download-service");

    const first = downloadModel({ key: MODEL_KEY, onProgress: vi.fn() });
    // download() being called guarantees the in-flight entry is registered.
    await vi.waitFor(() => expect(downloader.download).toHaveBeenCalledTimes(1));
    const second = downloadModel({ key: MODEL_KEY, onProgress: vi.fn() });

    finish();

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.key).toBe(MODEL_KEY);
    expect(secondResult.key).toBe(MODEL_KEY);
    expect(createModelDownloaderMock).toHaveBeenCalledTimes(1);
  });

  it("lets any attached caller's abort cancel the one real download", async () => {
    const { downloader } = makeControllableDownloader();
    createModelDownloaderMock.mockResolvedValue(downloader);
    const { downloadModel } = await import("../../electron/model-download-service");

    const first = downloadModel({ key: MODEL_KEY, onProgress: vi.fn() });
    // download() being called guarantees the in-flight entry is registered.
    await vi.waitFor(() => expect(downloader.download).toHaveBeenCalledTimes(1));

    const controller = new AbortController();
    const second = downloadModel({
      key: MODEL_KEY,
      onProgress: vi.fn(),
      signal: controller.signal,
    });

    // Attach the rejection expectations BEFORE triggering the abort so neither
    // promise is ever observed as an unhandled rejection.
    const firstRejects = expect(first).rejects.toThrow(/aborted/i);
    const secondRejects = expect(second).rejects.toThrow(/aborted/i);

    controller.abort();

    await firstRejects;
    await secondRejects;
    expect(downloader.cancel).toHaveBeenCalledWith({ deleteTempFile: true });
  });

  it("starts a fresh download for the same key once the previous one has finished", async () => {
    const first = makeControllableDownloader();
    createModelDownloaderMock.mockResolvedValueOnce(first.downloader);
    const { downloadModel } = await import("../../electron/model-download-service");

    const firstCall = downloadModel({ key: MODEL_KEY, onProgress: vi.fn() });
    // finish() only works once download() has run (that's when the resolver is
    // captured), so wait for it before settling — then let the first call
    // fully settle (and clear the in-flight map) before starting the second.
    await vi.waitFor(() => expect(first.downloader.download).toHaveBeenCalledTimes(1));
    first.finish();
    await firstCall;

    const second = makeControllableDownloader();
    createModelDownloaderMock.mockResolvedValueOnce(second.downloader);
    const secondCall = downloadModel({ key: MODEL_KEY, onProgress: vi.fn() });
    await vi.waitFor(() => expect(second.downloader.download).toHaveBeenCalledTimes(1));
    second.finish();
    await secondCall;

    expect(createModelDownloaderMock).toHaveBeenCalledTimes(2);
  });
});
