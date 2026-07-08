/**
 * F21 — Compression Streams API
 * Native gzip compress/decompress for IndexedDB cache entries.
 * Chrome 80+, Firefox 113+, Safari 16.4+ — zero dependencies.
 */

export async function compress(data: unknown): Promise<ArrayBuffer> {
  const json = JSON.stringify(data);
  const bytes = new TextEncoder().encode(json);

  if (typeof CompressionStream === "undefined" || typeof Response === "undefined") {
    // Fallback: store uncompressed (older browsers)
    return bytes.buffer as ArrayBuffer;
  }

  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  await writer.write(bytes);
  await writer.close();
  return new Response(cs.readable).arrayBuffer();
}

export async function decompress(buf: ArrayBuffer): Promise<unknown> {
  if (typeof DecompressionStream === "undefined" || typeof Response === "undefined") {
    // Fallback: treat as uncompressed JSON
    return JSON.parse(new TextDecoder().decode(buf));
  }

  try {
    const ds = new DecompressionStream("gzip");
    const writer = ds.writable.getWriter();
    await writer.write(buf);
    await writer.close();
    const text = await new Response(ds.readable).text();
    return JSON.parse(text);
  } catch {
    // Not gzipped (legacy entry) — try raw JSON decode
    return JSON.parse(new TextDecoder().decode(buf));
  }
}
