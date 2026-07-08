import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for the OS notification bridge (notify.ts).
 *
 * jsdom does not ship a real Notification API, so we install a minimal mock
 * on `window` before each test and tear it down after.  Module state is
 * reset between tests when needed so that `getElectronNotify()` always reads
 * the current `window.electronNotify`.
 */

// ---------------------------------------------------------------------------
// Notification mock helpers
// ---------------------------------------------------------------------------

type NotificationOptions = {
  body?: string;
  tag?: string;
  silent?: boolean;
};

/** Minimal Notification class mock (constructor records its calls). */
function makeNotificationMock(permission: string) {
  const MockNotification = vi.fn(function (
    this: Record<string, unknown>,
    _title: string,
    _options?: NotificationOptions,
  ) {
    // No-op constructor body — spy on the mock for assertions
  }) as unknown as typeof Notification & {
    permission: string;
    requestPermission: ReturnType<typeof vi.fn>;
  };

  Object.defineProperty(MockNotification, "permission", {
    configurable: true,
    writable: true,
    value: permission,
  });

  MockNotification.requestPermission = vi.fn().mockResolvedValue(permission);

  return MockNotification;
}

/** Install a Notification mock on window and return a cleanup function. */
function installNotificationMock(permission: string) {
  const mock = makeNotificationMock(permission);
  (window as unknown as Record<string, unknown>).Notification = mock;
  return {
    mock,
    cleanup() {
      delete (window as unknown as Record<string, unknown>).Notification;
    },
  };
}

/** Remove Notification entirely (simulates unsupported browser). */
function removeNotification() {
  const orig = (window as unknown as Record<string, unknown>).Notification;
  delete (window as unknown as Record<string, unknown>).Notification;
  return () => {
    if (orig !== undefined) {
      (window as unknown as Record<string, unknown>).Notification = orig;
    }
  };
}

// ---------------------------------------------------------------------------
// Module import helpers — we use vi.resetModules() to allow Electron-window
// state changes between tests.
// ---------------------------------------------------------------------------

async function importNotify() {
  return import("@/features/channel-monitor/lib/notify");
}

// ---------------------------------------------------------------------------
// notificationsSupported
// ---------------------------------------------------------------------------

describe("notificationsSupported", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns true when Notification is present on window", async () => {
    // Arrange: install minimal mock
    const { cleanup } = installNotificationMock("default");
    const { notificationsSupported } = await importNotify();

    // Act + Assert
    expect(notificationsSupported()).toBe(true);

    cleanup();
  });

  it("returns false when Notification is absent from window", async () => {
    // Arrange: remove Notification
    const restore = removeNotification();
    const { notificationsSupported } = await importNotify();

    // Act
    const result = notificationsSupported();

    // Restore before asserting
    restore();

    // Assert
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// notificationPermission
// ---------------------------------------------------------------------------

describe("notificationPermission", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns 'unsupported' when Notification is absent", async () => {
    // Arrange
    const restore = removeNotification();
    const { notificationPermission } = await importNotify();

    const result = notificationPermission();

    restore();

    expect(result).toBe("unsupported");
  });

  it("returns 'default' when permission is default", async () => {
    // Arrange
    const { mock, cleanup } = installNotificationMock("default");
    mock.permission = "default";
    const { notificationPermission } = await importNotify();

    // Act + Assert
    expect(notificationPermission()).toBe("default");

    cleanup();
  });

  it("returns 'granted' when permission is granted", async () => {
    // Arrange
    const { mock, cleanup } = installNotificationMock("granted");
    mock.permission = "granted";
    const { notificationPermission } = await importNotify();

    expect(notificationPermission()).toBe("granted");

    cleanup();
  });

  it("returns 'denied' when permission is denied", async () => {
    // Arrange
    const { mock, cleanup } = installNotificationMock("denied");
    mock.permission = "denied";
    const { notificationPermission } = await importNotify();

    expect(notificationPermission()).toBe("denied");

    cleanup();
  });
});

// ---------------------------------------------------------------------------
// requestNotificationPermission
// ---------------------------------------------------------------------------

describe("requestNotificationPermission", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns 'unsupported' when Notification is absent", async () => {
    // Arrange
    const restore = removeNotification();
    const { requestNotificationPermission } = await importNotify();

    const result = await requestNotificationPermission();

    restore();

    expect(result).toBe("unsupported");
  });

  it("returns 'granted' immediately without calling requestPermission when already granted", async () => {
    // Arrange
    const { mock, cleanup } = installNotificationMock("granted");
    mock.permission = "granted";
    const { requestNotificationPermission } = await importNotify();

    // Act
    const result = await requestNotificationPermission();

    // Assert: early return — requestPermission was NOT called
    expect(result).toBe("granted");
    expect(mock.requestPermission).not.toHaveBeenCalled();

    cleanup();
  });

  it("returns 'denied' immediately without calling requestPermission when already denied", async () => {
    // Arrange
    const { mock, cleanup } = installNotificationMock("denied");
    mock.permission = "denied";
    const { requestNotificationPermission } = await importNotify();

    // Act
    const result = await requestNotificationPermission();

    // Assert: early return
    expect(result).toBe("denied");
    expect(mock.requestPermission).not.toHaveBeenCalled();

    cleanup();
  });

  it("calls requestPermission and returns its result when permission is default", async () => {
    // Arrange
    const { mock, cleanup } = installNotificationMock("default");
    mock.permission = "default";
    mock.requestPermission = vi.fn().mockResolvedValue("granted");
    const { requestNotificationPermission } = await importNotify();

    // Act
    const result = await requestNotificationPermission();

    // Assert
    expect(result).toBe("granted");
    expect(mock.requestPermission).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("calls requestPermission and returns 'denied' result", async () => {
    // Arrange
    const { mock, cleanup } = installNotificationMock("default");
    mock.permission = "default";
    mock.requestPermission = vi.fn().mockResolvedValue("denied");
    const { requestNotificationPermission } = await importNotify();

    // Act
    const result = await requestNotificationPermission();

    expect(result).toBe("denied");

    cleanup();
  });

  it("returns 'denied' when requestPermission rejects (catch branch)", async () => {
    // Arrange
    const { mock, cleanup } = installNotificationMock("default");
    mock.permission = "default";
    mock.requestPermission = vi.fn().mockRejectedValue(new Error("blocked"));
    const { requestNotificationPermission } = await importNotify();

    // Act
    const result = await requestNotificationPermission();

    // Assert: catch block returns "denied"
    expect(result).toBe("denied");

    cleanup();
  });
});

// ---------------------------------------------------------------------------
// notify — Electron IPC path
// ---------------------------------------------------------------------------

describe("notify — Electron IPC path", () => {
  beforeEach(() => {
    vi.resetModules();
    // Ensure a working Notification mock is available so the module can be imported
    installNotificationMock("granted");
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).electronNotify;
    delete (window as unknown as Record<string, unknown>).Notification;
  });

  it("delegates to window.electronNotify.notify when present", async () => {
    // Arrange
    const electronNotifyFn = vi.fn();
    (window as unknown as Record<string, unknown>).electronNotify = {
      notify: electronNotifyFn,
    };
    const { notify } = await importNotify();

    // Act
    notify("Test Title", "Test body", "info");

    // Assert: Electron IPC was called with prefixed title
    expect(electronNotifyFn).toHaveBeenCalledTimes(1);
    expect(electronNotifyFn).toHaveBeenCalledWith("ℹ️ Test Title", "Test body");
  });

  it("uses the warning emoji prefix for severity=warning", async () => {
    // Arrange
    const electronNotifyFn = vi.fn();
    (window as unknown as Record<string, unknown>).electronNotify = {
      notify: electronNotifyFn,
    };
    const { notify } = await importNotify();

    // Act
    notify("Channel Down", "Volume dropped", "warning");

    // Assert
    expect(electronNotifyFn).toHaveBeenCalledWith("⚠️ Channel Down", "Volume dropped");
  });

  it("uses the critical emoji prefix for severity=critical", async () => {
    // Arrange
    const electronNotifyFn = vi.fn();
    (window as unknown as Record<string, unknown>).electronNotify = {
      notify: electronNotifyFn,
    };
    const { notify } = await importNotify();

    // Act
    notify("ALERT", "Failure rate critical", "critical");

    // Assert
    expect(electronNotifyFn).toHaveBeenCalledWith("🔴 ALERT", "Failure rate critical");
  });

  it("does NOT invoke the Web Notification constructor when Electron path is taken", async () => {
    // Arrange
    const electronNotifyFn = vi.fn();
    (window as unknown as Record<string, unknown>).electronNotify = {
      notify: electronNotifyFn,
    };
    const notifMock = (window as unknown as Record<string, unknown>)
      .Notification as ReturnType<typeof vi.fn>;
    const { notify } = await importNotify();

    // Act
    notify("Title", "Body", "info");

    // Assert: Web Notification constructor never called because Electron path returned early
    expect(notifMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// notify — Web Notification path (no Electron)
// ---------------------------------------------------------------------------

describe("notify — Web Notification path (no Electron)", () => {
  beforeEach(() => {
    vi.resetModules();
    delete (window as unknown as Record<string, unknown>).electronNotify;
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).Notification;
    delete (window as unknown as Record<string, unknown>).electronNotify;
  });

  it("creates a Web Notification with correct options when permission is granted", async () => {
    // Arrange
    const { mock, cleanup } = installNotificationMock("granted");
    mock.permission = "granted";
    const { notify } = await importNotify();

    // Act
    notify("Title", "Body text", "info");

    // Assert
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock).toHaveBeenCalledWith("ℹ️ Title", {
      body: "Body text",
      tag: "channel-monitor",
      silent: true, // info !== "critical"
    });

    cleanup();
  });

  it("sets silent=false for critical severity (audible OS notification)", async () => {
    // Arrange
    const { mock, cleanup } = installNotificationMock("granted");
    mock.permission = "granted";
    const { notify } = await importNotify();

    // Act
    notify("Critical", "Something broke", "critical");

    // Assert: silent = ("critical" !== "critical") = false
    expect(mock).toHaveBeenCalledWith("🔴 Critical", {
      body: "Something broke",
      tag: "channel-monitor",
      silent: false,
    });

    cleanup();
  });

  it("sets silent=true for warning severity", async () => {
    // Arrange
    const { mock, cleanup } = installNotificationMock("granted");
    mock.permission = "granted";
    const { notify } = await importNotify();

    // Act
    notify("Warning", "Degraded", "warning");

    // Assert: silent = ("warning" !== "critical") = true
    expect(mock).toHaveBeenCalledWith("⚠️ Warning", {
      body: "Degraded",
      tag: "channel-monitor",
      silent: true,
    });

    cleanup();
  });

  it("defaults severity to 'info' when not provided", async () => {
    // Arrange
    const { mock, cleanup } = installNotificationMock("granted");
    mock.permission = "granted";
    const { notify } = await importNotify();

    // Act: omit the third argument
    notify("No severity arg", "Body");

    // Assert: info emoji prefix and silent=true
    expect(mock).toHaveBeenCalledWith(
      "ℹ️ No severity arg",
      expect.objectContaining({ silent: true }),
    );

    cleanup();
  });

  it("no-ops when permission is 'default' (not yet granted)", async () => {
    // Arrange
    const { mock, cleanup } = installNotificationMock("default");
    mock.permission = "default";
    const { notify } = await importNotify();

    // Act
    notify("Title", "Body", "info");

    // Assert: constructor not called because Notification.permission !== "granted"
    expect(mock).not.toHaveBeenCalled();

    cleanup();
  });

  it("no-ops when permission is 'denied'", async () => {
    // Arrange
    const { mock, cleanup } = installNotificationMock("denied");
    mock.permission = "denied";
    const { notify } = await importNotify();

    // Act
    notify("Title", "Body", "warning");

    // Assert
    expect(mock).not.toHaveBeenCalled();

    cleanup();
  });

  it("no-ops when Notification API is absent (unsupported browser)", async () => {
    // Arrange
    const restore = removeNotification();
    const { notify } = await importNotify();

    // Act: must not throw
    expect(() => notify("Title", "Body", "info")).not.toThrow();

    restore();
  });

  it("swallows exceptions thrown by the Notification constructor", async () => {
    // Arrange: make the constructor throw using a class so vi doesn't warn
    const constructorSpy = vi.fn();
    class FailingNotification {
      constructor(title: string, options?: NotificationOptions) {
        constructorSpy(title, options);
        throw new Error("NotAllowedError");
      }
      static permission = "granted";
      static requestPermission = vi.fn().mockResolvedValue("granted");
    }
    (window as unknown as Record<string, unknown>).Notification = FailingNotification;

    const { notify } = await importNotify();

    // Act: must not throw despite constructor throwing
    expect(() => notify("Title", "Body", "critical")).not.toThrow();

    // Assert: constructor was attempted
    expect(constructorSpy).toHaveBeenCalledTimes(1);

    delete (window as unknown as Record<string, unknown>).Notification;
  });
});

// ---------------------------------------------------------------------------
// notify — passes tag "channel-monitor" consistently
// ---------------------------------------------------------------------------

describe("notify — tag field is always channel-monitor", () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).Notification;
    delete (window as unknown as Record<string, unknown>).electronNotify;
  });

  it("always uses tag='channel-monitor' in the Notification options", async () => {
    // Arrange
    vi.resetModules();
    const { mock, cleanup } = installNotificationMock("granted");
    mock.permission = "granted";
    const { notify } = await importNotify();

    // Act
    notify("Any", "Body", "warning");

    // Assert: tag is always "channel-monitor"
    const callArg = mock.mock.calls[0][1] as NotificationOptions;
    expect(callArg.tag).toBe("channel-monitor");

    cleanup();
  });
});
