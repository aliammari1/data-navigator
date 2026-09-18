# Defense dataset policy

The live PFE defense must use a generated synthetic DailyTransactions file, not production or subscriber data.

## Approved generator

Run:

```bash
node scripts/generate-defense-dataset.mjs --rows 10000 --date 20260918
```

The generator writes:

- `DailyTransactions_DEFENSE_SYNTHETIC_20260918.csv`
- a sibling `.manifest.json` containing the SHA-256 checksum and deterministic KPI ground truth

The default 10,000-row corpus is deliberately synthetic. Identifiers use explicit `SYN_` prefixes rather than phone-number-shaped values. It preserves the telecom schema, channel/status cardinality, numeric balances, and transaction amounts needed for the demo.

Ground truth by construction for row counts divisible by 20:

- 70% success (`PST`)
- 15% declined (`DCL`)
- 5% refund (`RFD`)
- 5% instance/hold (`HLD`)
- 5% submitted (`SBM`)
- four channels distributed evenly: MyTT, PORTAILTT, PO9, Eshop

## Not approved for the defense

Do **not** use the repository-root `DailyTransactions_20260301.csv` in screenshots, the live demo, or the fallback recording. Its phone-number-shaped values are visually ambiguous even if they were generated for testing.

Before freezing the demo, generate the final file once, copy both the CSV and manifest into the offline defense vault, and record the manifest SHA-256 in ALI-113.
