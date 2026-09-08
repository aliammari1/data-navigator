"use client";

import { Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarGroup } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/utils";
import { useRemoteCursors } from "../hooks/use-remote-cursors";

/** Untrusted awareness color — only plain hex may reach the style attribute. */
const SAFE_COLOR = /^#[0-9a-f]{3,8}$/i;

const AVATAR_COLORS = [
  "bg-violet-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-pink-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-teal-500",
];

function hashColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

export interface PeerPresenceOnSectionProps {
  sectionId: string;
  className?: string;
}

/**
 * Compact "X peers viewing this section" badge with an avatar stack.
 * Self-hides (returns `null`) when no remote peer is currently anchored to the
 * section — keeps the section header clean while solo.
 */
export function PeerPresenceOnSection({ sectionId, className }: PeerPresenceOnSectionProps) {
  const remote = useRemoteCursors(sectionId);
  if (remote.length === 0) return null;

  const label = `${remote[0]?.peer.name ?? ""} (${remote[0]?.peer.role ?? ""})`;
  const tooltip =
    remote.length === 1
      ? `${label} — viewing this section`
      : `${remote.map((r) => `${r.peer.name} (${r.peer.role})`).join(", ")} — viewing this section`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="secondary"
          className={cn(
            "gap-1.5 px-2 py-0.5 text-[10px] font-medium cursor-default",
            className,
          )}
        >
          <Users className="size-3 text-muted-foreground" />
          <span className="tabular-nums">{remote.length}</span>
          <span className="text-muted-foreground">
            {remote.length === 1 ? "peer viewing" : "peers viewing"}
          </span>
          <AvatarGroup className="ml-1">
            {remote.slice(0, 3).map(({ peer }) => {
              const color = peer.color && SAFE_COLOR.test(peer.color) ? peer.color : undefined;
              return (
                <Avatar key={peer.id} size="sm" className="size-4">
                  <AvatarFallback
                    className={cn(
                      "text-[8px] text-white font-semibold",
                      hashColor(peer.name),
                    )}
                    style={color ? { backgroundColor: color } : undefined}
                  >
                    {initials(peer.name)}
                  </AvatarFallback>
                </Avatar>
              );
            })}
            {remote.length > 3 && (
              <div className="relative flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[8px] text-muted-foreground ring-2 ring-background">
                +{remote.length - 3}
              </div>
            )}
          </AvatarGroup>
        </Badge>
      </TooltipTrigger>
      <TooltipContent sideOffset={6}>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
