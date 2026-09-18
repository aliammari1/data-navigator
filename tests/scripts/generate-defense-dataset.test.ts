import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("defense synthetic dataset generator", () => {
  it("emits deterministic PII-safe telecom data and a matching SHA-256 manifest", () => {
    const dir = mkdtempSync(join(tmpdir(), "dn-defense-dataset-"));
    tempDirs.push(dir);
    const csvPath = join(dir, "DailyTransactions_DEFENSE_SYNTHETIC_20260918.csv");

    const run = spawnSync(
      process.execPath,
      [
        resolve(process.cwd(), "scripts/generate-defense-dataset.mjs"),
        "--rows",
        "40",
        "--date",
        "20260918",
        "--out",
        csvPath,
      ],
      { encoding: "utf8" },
    );

    expect(run.status, run.stderr || run.stdout).toBe(0);

    const csv = readFileSync(csvPath, "utf8");
    const manifest = JSON.parse(readFileSync(`${csvPath}.manifest.json`, "utf8")) as {
      synthetic: boolean;
      containsRealPII: boolean;
      rows: number;
      columns: number;
      sha256: string;
      expected: {
        total: number;
        success: number;
        declined: number;
        refund: number;
        instance: number;
        submitted: number;
        successRatePct: number;
        byChannel: Record<string, number>;
        byChannelSuccessRatePct: Record<string, number>;
      };
    };

    const lines = csv.trimEnd().split("\n");
    const header = lines[0].split("|");
    const rows = lines.slice(1).map((line) => line.split("|"));

    expect(header).toHaveLength(51);
    expect(rows).toHaveLength(40);
    expect(manifest.synthetic).toBe(true);
    expect(manifest.containsRealPII).toBe(false);
    expect(manifest.rows).toBe(40);
    expect(manifest.columns).toBe(51);
    expect(manifest.expected).toMatchObject({
      total: 40,
      success: 28,
      declined: 6,
      refund: 2,
      instance: 2,
      submitted: 2,
      successRatePct: 70,
      byChannel: {
        MyTT: 10,
        PORTAILTT: 10,
        PO9: 10,
        Eshop: 10,
      },
      byChannelSuccessRatePct: {
        MyTT: 80,
        PORTAILTT: 80,
        PO9: 60,
        Eshop: 60,
      },
    });

    const indexes = Object.fromEntries(header.map((name, index) => [name, index]));
    for (const row of rows) {
      expect(row[indexes.ACCOUNT_MSISDN]).toMatch(/^SYN_ACCOUNT_ID_/);
      expect(row[indexes.CUSTOMER_MSISDN]).toMatch(/^SYN_CUSTOMER_ID_/);
      expect(row[indexes.GENERATION_ACCOUNT_MOBILE_NUMBER]).toMatch(/^SYN_GEN_ID_/);
      expect(row[indexes.VOUCHER_CODE]).toMatch(/^SYN_VOUCHER_/);
      expect(row[indexes.SERIAL_NUMBER]).toMatch(/^SYN_SERIAL_/);
    }

    const sha256 = createHash("sha256").update(csv, "utf8").digest("hex");
    expect(manifest.sha256).toBe(sha256);
  });
});
