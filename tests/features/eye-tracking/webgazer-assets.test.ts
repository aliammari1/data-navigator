import { stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";

const FACE_MESH_SOURCE = "/mediapipe/face_mesh/:asset*";
const FACE_MESH_DESTINATION = "/vendor/webgazer/mediapipe/face_mesh/:asset*";

const REQUIRED_FACE_MESH_ASSETS = [
  "face_mesh_solution_packed_assets_loader.js",
  "face_mesh_solution_simd_wasm_bin.js",
  "face_mesh.binarypb",
] as const;

describe("WebGazer MediaPipe assets", () => {
  it("vendors the FaceMesh files requested by WebGazer", async () => {
    for (const asset of REQUIRED_FACE_MESH_ASSETS) {
      const assetPath = path.resolve(
        process.cwd(),
        "public",
        "vendor",
        "webgazer",
        "mediapipe",
        "face_mesh",
        asset,
      );

      const assetStats = await stat(assetPath);

      expect(assetStats.isFile()).toBe(true);
      expect(assetStats.size).toBeGreaterThan(0);
    }
  });

  it("rewrites WebGazer's FaceMesh requests to the vendored files", async () => {
    if (!nextConfig.rewrites) {
      throw new Error("Next.js is missing the WebGazer MediaPipe asset rewrite");
    }

    const rewrites = await nextConfig.rewrites();
    const rules = Array.isArray(rewrites)
      ? rewrites
      : [
          ...(rewrites.beforeFiles ?? []),
          ...(rewrites.afterFiles ?? []),
          ...(rewrites.fallback ?? []),
        ];

    expect(rules).toContainEqual({
      source: FACE_MESH_SOURCE,
      destination: FACE_MESH_DESTINATION,
    });
  });
});
