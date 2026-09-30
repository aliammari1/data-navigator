/**
 * Normalize text chunks before they cross Electron IPC.
 *
 * node-llama-cpp documents onTextChunk as a string callback, but native/runtime
 * boundaries can still surface Buffer/Uint8Array-shaped values. Concatenating
 * those directly in the renderer coerces bytes into decimal text such as
 * "115,115,151", which looks like corrupted model output.
 */
function isArrayBuffer(chunk: unknown): chunk is ArrayBuffer {
  return (
    chunk instanceof ArrayBuffer || Object.prototype.toString.call(chunk) === "[object ArrayBuffer]"
  );
}

function asBytes(chunk: unknown): Uint8Array | null {
  if (chunk instanceof Uint8Array) return chunk;
  if (isArrayBuffer(chunk)) return new Uint8Array(chunk);
  if (ArrayBuffer.isView(chunk)) {
    return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }
  if (
    Array.isArray(chunk) &&
    chunk.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)
  ) {
    return Uint8Array.from(chunk);
  }
  if (
    typeof chunk === "object" &&
    chunk !== null &&
    "data" in chunk &&
    Array.isArray((chunk as { data?: unknown }).data)
  ) {
    const data = (chunk as { data: unknown[] }).data;
    if (
      data.every((value) => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 255)
    ) {
      return Uint8Array.from(data as number[]);
    }
  }
  return null;
}

export function createTextChunkNormalizer(onText: (text: string) => void) {
  const decoder = new TextDecoder();
  let decodingBytes = false;

  return {
    push(chunk: unknown): void {
      if (typeof chunk === "string") {
        if (decodingBytes) {
          const tail = decoder.decode();
          if (tail) onText(tail);
          decodingBytes = false;
        }
        if (chunk) onText(chunk);
        return;
      }

      const bytes = asBytes(chunk);
      if (!bytes) return;
      decodingBytes = true;
      const text = decoder.decode(bytes, { stream: true });
      if (text) onText(text);
    },

    flush(): void {
      if (!decodingBytes) return;
      const tail = decoder.decode();
      if (tail) onText(tail);
      decodingBytes = false;
    },
  };
}
