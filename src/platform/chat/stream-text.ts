function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return (
    value instanceof ArrayBuffer || Object.prototype.toString.call(value) === "[object ArrayBuffer]"
  );
}

function byteView(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (isArrayBuffer(value)) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)
  ) {
    return Uint8Array.from(value);
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "data" in value &&
    Array.isArray((value as { data?: unknown }).data)
  ) {
    const data = (value as { data: unknown[] }).data;
    if (
      data.length > 0 &&
      data.every((item) => Number.isInteger(item) && Number(item) >= 0 && Number(item) <= 255)
    ) {
      return Uint8Array.from(data as number[]);
    }
  }
  return null;
}

function decodeSerializedBytes(value: string): string | null {
  if (!/^(?:\d{1,3},){5,}\d{1,3}$/.test(value)) return null;
  const numbers = value.split(",").map(Number);
  if (numbers.some((item) => item < 0 || item > 255)) return null;

  const decoded = new TextDecoder().decode(Uint8Array.from(numbers));
  if (!decoded) return null;

  let printable = 0;
  for (const char of decoded) {
    const code = char.codePointAt(0) ?? 0;
    if (char === "\n" || char === "\r" || char === "\t" || code >= 32) printable += 1;
  }
  return printable / decoded.length >= 0.9 ? decoded : null;
}

export function normalizeCompleteStreamText(value: unknown): string {
  if (typeof value === "string") return decodeSerializedBytes(value) ?? value;
  const bytes = byteView(value);
  if (bytes) return new TextDecoder().decode(bytes);
  return "";
}

export function createRendererTextChunkNormalizer(onText: (text: string) => void) {
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
        const text = decodeSerializedBytes(chunk) ?? chunk;
        if (text) onText(text);
        return;
      }

      const bytes = byteView(chunk);
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
