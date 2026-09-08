"use client";

import { useEffect, useState } from "react";
import {
  type LANFollowRequest,
  readFollowRequest,
  subscribeLANRoom,
} from "@/platform/lan/lan-collab";

function sameRequest(a: LANFollowRequest | null, b: LANFollowRequest | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.fromPeerId === b.fromPeerId && a.ts === b.ts;
}

export function useFollowRequest(): LANFollowRequest | null {
  const [request, setRequest] = useState<LANFollowRequest | null>(() => readFollowRequest());

  useEffect(() => {
    const unsubscribe = subscribeLANRoom(() => {
      const next = readFollowRequest();
      setRequest((prev) => (sameRequest(prev, next) ? prev : next));
    });
    return unsubscribe;
  }, []);

  return request;
}
