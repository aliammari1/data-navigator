import { describe, it, expect } from "vitest";
import {
  DUCKDB_PARQUET_SUFFIX,
  ANALYTICS_CACHE_DB,
  AUTH_DB_FILE,
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
    it("is the string 'data-navigator-auth.sqlite'", () => {
      expect(AUTH_DB_FILE).toBe("data-navigator-auth.sqlite");
    });

    it("is a string", () => {
      expect(typeof AUTH_DB_FILE).toBe("string");
    });
  });
});
