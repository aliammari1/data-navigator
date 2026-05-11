"use client";

let tfPromise: Promise<typeof import("@tensorflow/tfjs")> | null = null;

async function initTF(): Promise<typeof import("@tensorflow/tfjs")> {
  const tf = await import("@tensorflow/tfjs");
  await tf.ready();

  const current = tf.getBackend();
  if (!current || current === "cpu") {
    for (const candidate of ["webgl", "wasm", "cpu"] as const) {
      try {
        const ok = await tf.setBackend(candidate);
        if (ok) break;
      } catch {
        // Try next backend.
      }
    }
    await tf.ready();
  }

  return tf;
}

export async function getTF() {
  tfPromise ??= initTF();
  return tfPromise;
}
