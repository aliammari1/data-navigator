"use client";

import { MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { acceptFollowMe, declineFollowMe, type LANFollowRequest } from "@/platform/lan/lan-collab";

interface FollowMeDialogProps {
  request: LANFollowRequest;
  onAccept: () => void;
  onDecline: () => void;
}

function remainingSeconds(expiresAt: number): number {
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
}

export function FollowMeDialog({ request, onAccept, onDecline }: FollowMeDialogProps) {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState(() => remainingSeconds(request.expiresAt));

  useEffect(() => {
    setSecondsLeft(remainingSeconds(request.expiresAt));
    const interval = setInterval(() => {
      setSecondsLeft(remainingSeconds(request.expiresAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [request.expiresAt]);

  const handleAccept = () => {
    acceptFollowMe(request);
    router.push(request.toPage);
    onAccept();
  };

  const handleDecline = () => {
    declineFollowMe(request);
    onDecline();
  };

  return (
    <Dialog open onOpenChange={(next) => !next && handleDecline()}>
      <DialogContent className="max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Demande de suivi
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{request.fromPeerName}</span> wants to
            navigate you to{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">{request.toPage}</code>
            {request.toTab ? (
              <>
                {" "}
                · onglet <span className="font-medium">{request.toTab}</span>
              </>
            ) : null}
            .
          </DialogDescription>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Cette demande expire dans{" "}
          <span className="font-semibold text-foreground">{secondsLeft}</span> seconde
          {secondsLeft === 1 ? "" : "s"}.
        </p>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleDecline}>
            Decline
          </Button>
          <Button type="button" onClick={handleAccept}>
            Accept
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
