/** PNG bytes → data URI string (for pptxgenjs / pdfmake image inputs). */
export function pngToDataUri(png: Uint8Array): string {
  let bin = "";
  // Chunked to avoid call-stack limits on large images.
  const CHUNK = 0x8000;
  for (let i = 0; i < png.length; i += CHUNK) {
    bin += String.fromCharCode(...png.subarray(i, i + CHUNK));
  }
  return `data:image/png;base64,${btoa(bin)}`;
}
