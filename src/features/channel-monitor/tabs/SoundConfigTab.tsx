"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/shared/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { playSoundAlert, unlockAudio } from "../lib/audio";
import { notificationPermission, type NotificationPermissionState } from "../lib/notify";
import { VirtualNotificationList } from "../components/VirtualNotificationList";
import { useMonitorStore } from "../store/monitor-store";
import type { AlertSeverity } from "../store/monitor-store";

export function SoundConfigTab() {
  const soundEnabled = useMonitorStore.use.soundEnabled();
  const setSoundEnabled = useMonitorStore.use.setSoundEnabled();
  const soundVolume = useMonitorStore.use.soundVolume();
  const setSoundVolume = useMonitorStore.use.setSoundVolume();
  const notifications = useMonitorStore.use.notifications();
  const markAllNotificationsRead = useMonitorStore.use.markAllNotificationsRead();
  const clearNotifications = useMonitorStore.use.clearNotifications();

  const [flashEnabled, setFlashEnabled] = useState(false);
  const [bannerEnabled, setBannerEnabled] = useState(true);
  const [permission, setPermission] = useState<NotificationPermissionState>("default");

  useEffect(() => {
    setPermission(notificationPermission());
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Test buttons double as the user-gesture that unlocks the shared AudioContext.
  const testSound = (severity: AlertSeverity) => {
    unlockAudio();
    playSoundAlert(severity, soundVolume);
  };

  return (
    <div className="space-y-5">
      {/* Sound alerts */}
      <Card className="bg-slate-900/80 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-slate-100 text-base">Sound Alerts</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Master Enable</span>
              <Switch
                checked={soundEnabled}
                onCheckedChange={(v) => {
                  // Toggling on counts as a gesture — unlock audio now.
                  if (v) unlockAudio();
                  setSoundEnabled(v);
                }}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-300">Volume</span>
              <span className="text-xs text-slate-500">{Math.round(soundVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={soundVolume}
              onChange={(e) => setSoundVolume(Number(e.target.value))}
              className="w-full accent-slate-500"
              disabled={!soundEnabled}
            />
          </div>

          {(["info", "warning", "critical"] as AlertSeverity[]).map((sev) => {
            const config: Record<AlertSeverity, { label: string; desc: string }> = {
              info: { label: "Info", desc: "Subtle beep (880 Hz)" },
              warning: { label: "Warning", desc: "Double beep (660 Hz)" },
              critical: { label: "Critical", desc: "Repeating alarm (440 Hz)" },
            };
            return (
              <div key={sev} className="flex items-center justify-between gap-3">
                <div>
                  <span
                    className={cn(
                      "text-sm font-medium",
                      sev === "critical"
                        ? "text-red-400"
                        : sev === "warning"
                          ? "text-amber-400"
                          : "text-blue-400",
                    )}
                  >
                    {config[sev].label}
                  </span>
                  <span className="text-xs text-slate-500 ml-2">{config[sev].desc}</span>
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={!soundEnabled}
                  onClick={() => testSound(sev)}
                >
                  Test Sound
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* OS notifications — enable control lives in Settings > Notifications */}
      <Card className="bg-slate-900/80 border-slate-800">
        <CardHeader>
          <CardTitle className="text-slate-100 text-base">Desktop Notifications</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm text-slate-300">
              Alert the operator when the window is in the background
            </div>
            <div className="text-xs text-slate-500">
              Status:{" "}
              <span
                className={cn(
                  "font-medium",
                  permission === "granted"
                    ? "text-emerald-400"
                    : permission === "denied"
                      ? "text-red-400"
                      : "text-amber-400",
                )}
              >
                {permission}
              </span>
            </div>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link href="/dashboard/settings?tab=notifications">Manage in Settings</Link>
          </Button>
        </CardContent>
      </Card>

      {/* Visual alerts */}
      <Card className="bg-slate-900/80 border-slate-800">
        <CardHeader>
          <CardTitle className="text-slate-100 text-base">Visual Alert Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-300">Flash screen on critical alerts</div>
              <div className="text-xs text-slate-500">
                CSS animation flashes the viewport border red
              </div>
            </div>
            <Switch checked={flashEnabled} onCheckedChange={setFlashEnabled} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-300">Full-screen banner for critical</div>
              <div className="text-xs text-slate-500">
                Shows a top banner overlay for critical severity
              </div>
            </div>
            <Switch checked={bannerEnabled} onCheckedChange={setBannerEnabled} />
          </div>
        </CardContent>
      </Card>

      {/* Notification history (virtualized) */}
      <Card className="bg-slate-900/80 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-slate-100 text-base">Notification History</CardTitle>
              {unreadCount > 0 && (
                <span className="bg-red-500/20 text-red-400 border border-red-500/30 text-xs px-1.5 py-0.5 rounded-full font-medium">
                  {unreadCount} unread
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="xs" variant="ghost" onClick={markAllNotificationsRead}>
                Mark all read
              </Button>
              <Button size="xs" variant="destructive" onClick={clearNotifications}>
                Clear all
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <VirtualNotificationList notifications={notifications} />
        </CardContent>
      </Card>
    </div>
  );
}
