"use client";

import { Check, Copy, QrCode } from "lucide-react";
import Image from "next/image";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { copyTextToClipboard } from "@/platform/collab/copy-text";
import { cn } from "@/shared/utils";

export interface InviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  joinUrl: string;
  pairingCode: string;
  error?: string;
}

interface CopyFieldProps {
  label: string;
  value: string;
  monospace?: boolean;
}

function CopyField({ label, value, monospace }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  const handleCopy = useCallback(async () => {
    setCopyError("");
    try {
      await copyTextToClipboard(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      setCopyError((error as Error).message);
    }
  }, [value]);

  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="mt-1 flex gap-2">
        <input
          type="text"
          readOnly
          value={value}
          onFocus={(event) => event.currentTarget.select()}
          className={cn(
            "h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground outline-none focus:border-primary",
            monospace && "font-mono",
          )}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCopy}
          disabled={!value}
          className="h-9 shrink-0"
          aria-label={`Copier ${label}`}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </Button>
      </div>
      {copyError && (
        <span role="alert" className="mt-1 block text-xs text-destructive">
          {copyError}
        </span>
      )}
    </label>
  );
}

export function InviteDialog({
  open,
  onOpenChange,
  joinUrl,
  pairingCode,
  error,
}: InviteDialogProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (!joinUrl) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(joinUrl, { width: 220, margin: 1 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [joinUrl, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="size-4" />
            Inviter un collaborateur
          </DialogTitle>
          <DialogDescription>
            Partagez le QR ou le lien ci-dessous. Le collaborateur scanne ou ouvre l'URL, saisit le
            code d'accès, et rejoint la session LAN.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          {qrDataUrl ? (
            <div className="border border-border bg-background p-3">
              <Image
                src={qrDataUrl}
                alt="QR code d'invitation à la session LAN"
                width={220}
                height={220}
                unoptimized
                priority
              />
            </div>
          ) : (
            <div className="grid h-[220px] w-[220px] place-items-center rounded-xl border border-dashed border-border bg-muted/40 text-xs text-muted-foreground">
              Génération du QR…
            </div>
          )}

          <div className="w-full space-y-3">
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
            <CopyField label="Lien d'invitation" value={joinUrl} />
            <CopyField label="Code d'accès" value={pairingCode} monospace />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
