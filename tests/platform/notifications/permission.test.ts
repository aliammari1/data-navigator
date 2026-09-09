import { afterEach, describe, expect, it, vi } from "vitest";
import {
  notificationPermission,
  requestNotificationPermission,
} from "@/platform/notifications/permission";

function stubNotification(value: unknown) {
  Object.defineProperty(window, "Notification", {
    writable: true,
    configurable: true,
    value,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  // jsdom has no Notification by default; delete the stub so `"Notification"
  // in window` is false again (assigning undefined would still match `in`).
  delete (window as unknown as Record<string, unknown>).Notification;
});

describe("notificationPermission", () => {
  it("returns unsupported when the API is absent", () => {
    expect(notificationPermission()).toBe("unsupported");
  });

  it("returns the live permission when present", () => {
    stubNotification({ permission: "granted", requestPermission: vi.fn() });
    expect(notificationPermission()).toBe("granted");
  });
});

describe("requestNotificationPermission", () => {
  it("returns unsupported when the API is absent", async () => {
    await expect(requestNotificationPermission()).resolves.toBe("unsupported");
  });

  it("short-circuits granted and denied without prompting", async () => {
    const requestPermission = vi.fn();
    stubNotification({ permission: "granted", requestPermission });
    await expect(requestNotificationPermission()).resolves.toBe("granted");
    expect(requestPermission).not.toHaveBeenCalled();

    stubNotification({ permission: "denied", requestPermission });
    await expect(requestNotificationPermission()).resolves.toBe("denied");
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("forwards the prompt result", async () => {
    const requestPermission = vi.fn().mockResolvedValue("granted");
    stubNotification({ permission: "default", requestPermission });
    await expect(requestNotificationPermission()).resolves.toBe("granted");
    expect(requestPermission).toHaveBeenCalledOnce();
  });

  it("maps a throwing prompt to denied", async () => {
    const requestPermission = vi.fn().mockRejectedValue(new Error("dismissed"));
    stubNotification({ permission: "default", requestPermission });
    await expect(requestNotificationPermission()).resolves.toBe("denied");
  });
});
