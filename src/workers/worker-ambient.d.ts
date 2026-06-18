/**
 * Ambient module declarations for worker-subsystem dependencies that ship no
 * TypeScript types (and have no installed @types package). Scoped to the worker
 * subsystem to avoid collisions with sibling agents' declarations.
 */

// density-clustering — DBSCAN/OPTICS/KMEANS (pure JS, no types).
declare module "density-clustering" {
  export class DBSCAN {
    run(
      dataset: number[][],
      epsilon: number,
      minPoints: number,
      distanceFunction?: (a: number[], b: number[]) => number,
    ): number[][];
    noise: number[];
  }
  export class OPTICS {
    run(
      dataset: number[][],
      epsilon: number,
      minPoints: number,
      distanceFunction?: (a: number[], b: number[]) => number,
    ): number[][];
  }
  export class KMEANS {
    run(dataset: number[][], k: number): number[][];
  }
}

// pdfmake split entry points (no types for the build/* paths).
declare module "pdfmake/build/pdfmake" {
  interface PdfDocument {
    getBuffer(callback: (buffer: Uint8Array) => void, tableLayouts?: unknown): void;
    getBlob(callback: (blob: Blob) => void, tableLayouts?: unknown): void;
    download(defaultFileName?: string): void;
  }
  interface PdfMakeStatic {
    vfs: Record<string, string>;
    fonts?: Record<string, unknown>;
    createPdf(documentDefinition: unknown): PdfDocument;
  }
  const pdfMake: PdfMakeStatic;
  export default pdfMake;
}

declare module "pdfmake/build/vfs_fonts" {
  const vfsFonts: { vfs: Record<string, string> } & {
    default?: { vfs: Record<string, string> };
  };
  export default vfsFonts;
}
