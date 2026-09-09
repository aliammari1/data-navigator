"use client";

import { createContext, type ReactNode, useContext, useMemo } from "react";

/**
 * Lets a hosted feature screen learn which desktop window it is rendered in,
 * without every screen taking new props. The window frame wraps each hosted
 * component in `<WindowProvider>`; screens that want to register pages or scope
 * menu commands read `useWindowId()` / `useWindowContext()`.
 */

interface WindowCtxValue {
  windowId: string;
  appId: string;
}

const WindowCtx = createContext<WindowCtxValue | null>(null);

export function WindowProvider({
  windowId,
  appId,
  children,
}: {
  windowId: string;
  appId: string;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ windowId, appId }), [windowId, appId]);
  return <WindowCtx.Provider value={value}>{children}</WindowCtx.Provider>;
}

/** The `{ windowId, appId }` of the current hosted screen, or null outside a window. */
export function useWindowContext(): WindowCtxValue | null {
  return useContext(WindowCtx);
}

/** The current hosted screen's window id, or null when not inside a window. */
export function useWindowId(): string | null {
  return useContext(WindowCtx)?.windowId ?? null;
}
