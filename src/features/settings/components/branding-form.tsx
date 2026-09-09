"use client";

/**
 * Branding configuration panel — memoized + isolated so company-name keystrokes
 * don't re-render the channel list or slide previews.
 *
 * The logo is a LOCAL FILE picker (stored as bytes in Dexie via `useBranding`),
 * not a remote URL — so exports embed it fully offline. The preview renders the
 * bytes through an object URL (revoked on change), never a network `<img src>`.
 */

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { BrandingProfile } from "@/core/branding/types";

export interface BrandingFormProps {
  branding: BrandingProfile;
  update: (patch: Partial<BrandingProfile>) => void;
  setLogoFromFile: (file: File) => Promise<void>;
  clearLogo: () => void;
}

function useLogoObjectUrl(bytes?: ArrayBuffer, mime?: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!bytes || bytes.byteLength === 0) {
      setUrl(null);
      return;
    }
    const objUrl = URL.createObjectURL(new Blob([bytes], { type: mime || "image/png" }));
    setUrl(objUrl);
    return () => URL.revokeObjectURL(objUrl);
  }, [bytes, mime]);
  return url;
}

function BrandingFormImpl({ branding, update, setLogoFromFile, clearLogo }: BrandingFormProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const logoUrl = useLogoObjectUrl(branding.logoBytes, branding.logoMime);
  const initials = useMemo(
    () => (branding.companyName || "TX").slice(0, 2).toUpperCase(),
    [branding.companyName],
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Brand Configuration</CardTitle>
          <CardDescription>
            Customize the appearance of all exported reports. Saved on-device.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Company Name
            </label>
            <Input
              value={branding.companyName}
              onChange={(e) => update({ companyName: e.target.value })}
              placeholder="Your company name"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Primary Color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={branding.primaryColor}
                onChange={(e) => update({ primaryColor: e.target.value })}
                className="w-10 h-9 rounded border border-input cursor-pointer"
              />
              <Input
                value={branding.primaryColor}
                onChange={(e) => update({ primaryColor: e.target.value })}
                placeholder="#003087"
                className="font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Company Logo
            </label>
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void setLogoFromFile(file);
                  e.target.value = "";
                }}
              />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                {branding.logoBytes ? "Replace logo…" : "Choose logo…"}
              </Button>
              {branding.logoBytes && (
                <Button variant="ghost" size="sm" onClick={clearLogo}>
                  Remove
                </Button>
              )}
              {branding.logoName && (
                <span className="text-xs text-muted-foreground truncate">{branding.logoName}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Stored locally and embedded into exported files — no network required.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Footer Text
            </label>
            <Input
              value={branding.footerText}
              onChange={(e) => update({ footerText: e.target.value })}
              placeholder="Confidential — For internal use only"
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer py-2">
            <input
              type="checkbox"
              checked={branding.applyToAll}
              onChange={(e) => update({ applyToAll: e.target.checked })}
              className="accent-primary"
            />
            <div>
              <div className="text-sm font-medium">Apply branding to all exports</div>
              <div className="text-xs text-muted-foreground">
                Company name, color, logo and footer appear in all generated files
              </div>
            </div>
          </label>

          <div className="flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2">
            <span className="text-green-400 text-sm">✓</span>
            <span className="text-xs text-green-400">
              Settings saved automatically to local IndexedDB storage
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Branded Header Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl overflow-hidden border border-border">
            <div className="p-5" style={{ backgroundColor: branding.primaryColor }}>
              <div className="flex items-center gap-3">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl}
                    alt="logo"
                    className="w-10 h-10 rounded object-contain bg-white/10 p-1"
                  />
                ) : (
                  <div className="w-10 h-10 rounded bg-white/20 flex items-center justify-center text-white font-bold text-sm">
                    {initials}
                  </div>
                )}
                <div>
                  <div className="text-white font-bold text-lg">{branding.companyName}</div>
                  <div className="text-white/60 text-xs">Daily Transaction Report</div>
                </div>
                <div className="ml-auto text-white/60 text-xs text-right">
                  <div>{new Date().toISOString().slice(0, 10)}</div>
                  <div>CONFIDENTIAL</div>
                </div>
              </div>
            </div>

            <div className="bg-card p-5 space-y-3">
              <div
                className="h-3 rounded"
                style={{ backgroundColor: branding.primaryColor, opacity: 0.3, width: "60%" }}
              />
              <div className="h-2 bg-muted rounded w-full" />
              <div className="h-2 bg-muted rounded w-4/5" />
              <div className="grid grid-cols-3 gap-2 mt-3">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-12 rounded-lg"
                    style={{ backgroundColor: branding.primaryColor, opacity: 0.15 }}
                  />
                ))}
              </div>
            </div>

            <div className="px-5 py-2.5 bg-muted/50 border-t border-border">
              <p className="text-xs text-muted-foreground text-center">{branding.footerText}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export const BrandingForm = memo(BrandingFormImpl);
