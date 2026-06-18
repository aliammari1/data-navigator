export { Desktop } from "@/features/desktop/components/desktop";
export { DESKTOP_APPS, getApp, LAUNCHER_APPS, PINNED_APPS } from "@/features/desktop/core/app-registry";
export type { DesktopApp } from "@/features/desktop/core/app-registry";
export {
  useDesktopActions,
  useDesktopStore,
  useDesktopWindows,
  useLauncherOpen,
  useWallpaper,
  WALLPAPERS,
} from "@/features/desktop/store/desktop-store";
