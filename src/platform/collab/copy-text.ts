/** Copy text through Electron's native clipboard, or the browser clipboard on the web. */
function copyWithSelection(text: string): boolean {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") return false;
  const field = document.createElement("textarea");
  field.value = text;
  field.readOnly = true;
  field.style.position = "fixed";
  field.style.left = "-9999px";
  const previousFocus = document.activeElement as HTMLElement | null;
  document.body.appendChild(field);
  try {
    field.select();
    return document.execCommand("copy");
  } finally {
    field.remove();
    previousFocus?.focus();
  }
}

export async function copyTextToClipboard(text: string): Promise<void> {
  if (!text) throw new Error("There is no text to copy yet.");

  const nativeClipboard =
    typeof window !== "undefined"
      ? (
          window as Window & {
            electronClipboard?: { writeText?: (value: string) => Promise<void> };
          }
        ).electronClipboard
      : undefined;
  if (nativeClipboard?.writeText) {
    await nativeClipboard.writeText(text);
    return;
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      if (copyWithSelection(text)) return;
      throw error;
    }
  }
  if (copyWithSelection(text)) return;
  throw new Error("Clipboard is unavailable in this window.");
}
