import { describe, expect, it } from "vitest";
import {
  ANALYTICS_CACHE_DB,
  AUTH_DB_FILE,
  DUCKDB_PARQUET_SUFFIX,
} from "@/platform/storage/storage-constants";

describe("storage-constants", () => {
  describe("DUCKDB_PARQUET_SUFFIX", () => {
    it("is the string '.parquet'", () => {
      expect(DUCKDB_PARQUET_SUFFIX).toBe(".parquet");
    });

    it("is a string", () => {
      expect(typeof DUCKDB_PARQUET_SUFFIX).toBe("string");
    });
  });

  describe("ANALYTICS_CACHE_DB", () => {
    it("is the string 'data-navigator-analytics-cache'", () => {
      expect(ANALYTICS_CACHE_DB).toBe("data-navigator-analytics-cache");
    });

    it("is a string", () => {
      expect(typeof ANALYTICS_CACHE_DB).toBe("string");
    });
  });

  describe("AUTH_DB_FILE", () => {
    it("is the string 'auth.db'", () => {
      expect(AUTH_DB_FILE).toBe("auth.db");
    });

    it("is a string", () => {
      expect(typeof AUTH_DB_FILE).toBe("string");
    });
  });
});
