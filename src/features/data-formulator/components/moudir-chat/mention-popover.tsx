"use client";

/**
 * Moudir composer @-mentions — the 2026 context pattern (Cursor @files), applied
 * to the analyst's own data: typing "@" surfaces the loaded DATASETS and the
 * COLUMNS of the active dataset so the prompt can name real fields the model then
 * reads. The mention is plain text in the prompt — no special encoding — so the
 * popover's only job is discovery + a clean insertion.
 *
 * This file owns two things:
 *   - the pure token helpers (`detectMention` / `applyMention`) the composer uses
 *     to read the "@token" at the caret and splice a chosen name back in, and
 *   - `MentionPopover`, a controlled cmdk list anchored to the composer. Focus
 *     stays in the textarea (the popover never steals it); the composer drives
 *     the highlight with Arrow/Enter, the mouse drives it via cmdk hover/click.
 */

import {Command as CommandPrimitive} from "cmdk";
import {Columns3, Database} from "lucide-react";
import type {ReactNode} from "react";
import {Popover, PopoverAnchor, PopoverContent} from "@/components/ui/popover";

// ─── Token model ────────────────────────────────────────────────────────────

/** An item the user can mention: a dataset or a column of the active dataset. */
export interface MentionItem {
    /** Stable, unique cmdk value (e.g. "ds:ds_1" / "col:Recharge"). */
    id: string;
    /** Display + match text (the dataset/column name). */
    label: string;
    /** Text spliced in after the "@" (the bare name). */
    insertText: string;
    kind: "dataset" | "column";
    /** Secondary line: row count for datasets, type for columns. */
    detail?: string;
}

/** An active "@token" sitting at the caret. */
export interface MentionQuery {
    /** Text typed after the "@" (may be empty right after "@"). */
    query: string;
    /** Index of the "@" in the textarea value. */
    start: number;
}

/**
 * Read the "@token" ending at `caret`, or null when the caret is not inside one.
 * The "@" must start the value or follow whitespace (so emails never trigger),
 * and the token itself must not contain whitespace (a space ends the mention).
 */
export function detectMention(value: string, caret: number): MentionQuery | null {
    const upto = value.slice(0, caret);
    const at = upto.lastIndexOf("@");
    if (at === -1) return null;

    const before = at > 0 ? upto[at - 1] : "";
    if (before && !/\s/.test(before)) return null;

    const token = upto.slice(at + 1);
    if (/\s/.test(token)) return null;

    return {query: token, start: at};
}

/**
 * Splice `@insert ` over the token spanning `[start, caret)` and return the next
 * value plus the caret position just after the inserted name.
 */
export function applyMention(
    value: string,
    start: number,
    caret: number,
    insert: string,
): { value: string; caret: number } {
    const head = value.slice(0, start);
    const tail = value.slice(caret);
    const mention = `@${insert} `;
    return {value: head + mention + tail, caret: head.length + mention.length};
}

// ─── Popover ────────────────────────────────────────────────────────────────

interface MentionPopoverProps {
    /** Whether the mention list is showing. */
    open: boolean;
    /** Datasets-first, columns-second; the composer keeps this order for nav. */
    items: MentionItem[];
    /** Currently highlighted item id (composer-driven for keyboard, cmdk for mouse). */
    activeId: string | null;
    onActiveIdChange: (id: string) => void;
    onSelect: (item: MentionItem) => void;
    onOpenChange: (open: boolean) => void;
    /** The composer box — becomes the popover's positioning anchor. */
    children: ReactNode;
}

const ICON: Record<MentionItem["kind"], typeof Database> = {
    dataset: Database,
    column: Columns3,
};

const GROUP_LABEL: Record<MentionItem["kind"], string> = {
    dataset: "Jeux de données",
    column: "Colonnes",
};

function MentionGroup({
                          kind,
                          items,
                          onSelect,
                      }: {
    kind: MentionItem["kind"];
    items: MentionItem[];
    onSelect: (item: MentionItem) => void;
}) {
    if (items.length === 0) return null;
    const Icon = ICON[kind];

    return (
        <CommandPrimitive.Group
            className="overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-[0.16em] [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase"
            heading={GROUP_LABEL[kind]}
        >
            {items.map((item) => (
                <CommandPrimitive.Item
                    key={item.id}
                    value={item.id}
                    onSelect={() => onSelect(item)}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden select-none data-[selected=true]:bg-ai/10 data-[selected=true]:text-ai"
                >
                    <Icon className="size-3.5 shrink-0 text-ai"/>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.detail ? (
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
              {item.detail}
            </span>
                    ) : null}
                </CommandPrimitive.Item>
            ))}
        </CommandPrimitive.Group>
    );
}

/**
 * Controlled mention list. `shouldFilter={false}` — the composer has already
 * filtered `items` by the token, so cmdk here only renders, highlights, and
 * scrolls the active row into view.
 */
export function MentionPopover({
                                   open,
                                   items,
                                   activeId,
                                   onActiveIdChange,
                                   onSelect,
                                   onOpenChange,
                                   children,
                               }: MentionPopoverProps) {
    const datasets = items.filter((item) => item.kind === "dataset");
    const columns = items.filter((item) => item.kind === "column");

    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverAnchor asChild>
                <div className="contents">{children}</div>
            </PopoverAnchor>
            <PopoverContent
                side="top"
                align="start"
                sideOffset={8}
                onOpenAutoFocus={(event) => event.preventDefault()}
                onCloseAutoFocus={(event) => event.preventDefault()}
                onMouseDown={(event) => event.preventDefault()}
                className="w-[min(22rem,calc(100vw-2rem))] gap-0 p-0">
                <CommandPrimitive
                    shouldFilter={false}
                    value={activeId ?? ""}
                    onValueChange={onActiveIdChange}
                    className="flex max-h-72 flex-col overflow-hidden rounded-md bg-popover text-popover-foreground"
                >
                    <CommandPrimitive.List className="max-h-72 overflow-x-hidden overflow-y-auto scroll-py-1 p-1">
                        <CommandPrimitive.Empty className="px-2 py-6 text-center text-sm text-muted-foreground">
                            Aucune correspondance
                        </CommandPrimitive.Empty>
                        <MentionGroup kind="dataset" items={datasets} onSelect={onSelect}/>
                        {datasets.length > 0 && columns.length > 0 ? (
                            <div className="my-1 h-px bg-border"/>
                        ) : null}
                        <MentionGroup kind="column" items={columns} onSelect={onSelect}/>
                    </CommandPrimitive.List>
                </CommandPrimitive>
            </PopoverContent>
        </Popover>
    );
}
