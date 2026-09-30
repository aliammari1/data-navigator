---
"data-navigator": patch
---

Keep Granite 4.0 1B available and run it without GPU layers on Vulkan, where its generated text was reproducibly corrupted. Validate GGUF tokenizer round trips before chat generation, and serialize session disposal with prompts so model changes cannot interrupt an active reply.
