"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { connectLAN, readLANSettings, saveLANSettings } from "@/platform/lan/lan-collab";

type Status = "loading" | "pending" | "approved" | "denied" | "expired" | "missing";
type StatusPayload = {
  status: string;
  name?: string;
  approvedRole?: string;
  pendingId?: string;
};

const POLL_INTERVAL_MS = 2000;

function GuestWaitingContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const [status, setStatus] = useState<Status>("loading");
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stoppedRef = useRef(false);
  const activatedRef = useRef(false);
  const activate = useCallback(async (pendingId: string) => {
    if (activatedRef.current) return;
    activatedRef.current = true;
    try {
      const r = await fetch("/api/guest/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pendingId }),
      });
      if (r.ok) {
        // Persist LAN settings and establish the WebSocket connection so the
        // guest lands on the dashboard already synchronized with the host.
        const acceptData = (await r.json().catch(() => ({}))) as {
          room?: string;
          url?: string;
          name?: string;
          role?: string;
        };
        const current = readLANSettings();
        const updated = {
          ...current,
          room: acceptData.room ?? current.room,
          url: acceptData.url ?? current.url,
          peer: {
            ...current.peer,
            name: acceptData.name ?? current.peer.name,
            role: (acceptData.role ?? current.peer.role) as
              | "viewer"
              | "editor"
              | "reviewer"
              | "host",
          },
        };
        saveLANSettings(updated);
        try {
          await connectLAN(updated);
        } catch {
          // Connection failure is non-fatal. The dashboard will retry.
        }
        window.location.replace("/dashboard/collaborative");
      } else {
        activatedRef.current = false;
        setError(`Accept failed: ${r.status}`);
      }
    } catch (err) {
      activatedRef.current = false;
      setError(err instanceof Error ? err.message : "Network error");
    }
  }, []);

  useEffect(() => {
    if (!id) {
      setStatus("missing");
      return;
    }
    let cancelled = false;
    const tick = async () => {
      if (cancelled || stoppedRef.current) return;
      try {
        const r = await fetch(`/api/guest/status?id=${encodeURIComponent(id)}`, {
          cache: "no-store",
        });
        if (!r.ok && r.status !== 410) {
          setError(`Status ${r.status}`);
          return;
        }
        const data = (await r.json()) as StatusPayload;
        if (cancelled) return;
        if (data.status === "approved") {
          stoppedRef.current = true;
          setName(data.name ?? null);
          setStatus("approved");
          void activate(id);
          return;
        }
        if (data.status === "denied") {
          stoppedRef.current = true;
          setStatus("denied");
          return;
        }
        if (data.status === "expired" || r.status === 410) {
          stoppedRef.current = true;
          setStatus("expired");
          return;
        }
        if (data.status === "pending") {
          setName(data.name ?? null);
          setStatus("pending");
          return;
        }
        setStatus("pending");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
      }
    };
    void tick();
    const id2 = window.setInterval(() => void tick(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id2);
    };
  }, [id, activate]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: "28rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.1rem", marginBottom: ".5rem" }}>
          {status === "approved" ? "Joining session..." : null}
          {status === "pending" ? "Waiting for the host" : null}
          {status === "denied" ? "Request denied" : null}
          {status === "expired" ? "This invite has expired" : null}
          {status === "missing" ? "Missing invite id" : null}
          {status === "loading" ? "Connecting..." : null}
        </h1>
        {status === "pending" ? (
          <p style={{ color: "#6b7280", lineHeight: 1.5 }}>
            {name ? <strong>{name}</strong> : "The guest"} asked to join the host's session. The
            host will see a notification and can approve or decline. This page will redirect
            automatically once approved.
          </p>
        ) : null}
        {status === "approved" ? (
          <p style={{ color: "#6b7280", lineHeight: 1.5 }}>
            Approved. Redirecting to the dashboard...
          </p>
        ) : null}
        {status === "denied" ? (
          <p style={{ color: "#6b7280", lineHeight: 1.5 }}>
            The host declined your request. Ask the host to send a new invite.
          </p>
        ) : null}
        {status === "expired" ? (
          <p style={{ color: "#6b7280", lineHeight: 1.5 }}>
            Ask the host to send a new invite link.
          </p>
        ) : null}
        {error ? <p style={{ color: "#b91c1c", fontSize: ".75rem" }}>{error}</p> : null}
      </div>
    </div>
  );
}

export default function GuestWaitingPage() {
  return (
    <Suspense fallback={null}>
      <GuestWaitingContent />
    </Suspense>
  );
}
