// Local, feature-scoped download helpers. The app has equivalents under
// feature folders (telecom/export, data-formulator/core) but those are outside
// this feature's write scope, so the history feature keeps its own tiny copy
// rather than reaching across feature boundaries.

export function downloadBlob(blob: Blob, name: string): void {
  const anchor = document.createElement("a");
  const url = URL.createObjectURL(blob);
  anchor.href = url;
  anchor.download = name;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadText(content: string, name: string, type: string): void {
  downloadBlob(new Blob([content], { type }), name);
}
