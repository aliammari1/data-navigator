export function downloadTextFile(content: string, name: string, type = "text/csv") {
  downloadBlob(new Blob([content], { type }), name);
}

export function downloadBlob(blob: Blob, name: string) {
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}
