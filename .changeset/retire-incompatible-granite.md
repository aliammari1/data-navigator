---
"data-navigator": patch
---

Retire the Granite 4.0 1B GGUF from Moudir because its tokenizer is incompatible with the bundled local runtime. Ignore stale persisted selections of retired checkpoints and reject chat GGUFs that fail a tokenizer round-trip sanity check instead of streaming numeric garbage.
