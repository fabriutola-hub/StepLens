# @agent-replay/core

Shared building blocks for [StepLens](https://github.com/fabriutola-hub/StepLens):

- **Types** — `Trace`, `ReplaySpan`, `ModelCall`, `ToolCall`, `ReplayEvent`, and
  the related enums/constants.
- **Schemas** — Zod schemas for validation, including the `batchIngest` schema
  used by the Studio ingest API.
- **Cost** — `calculateCost(model, inputTokens, outputTokens)` and
  `lookupPricing(model)`, backed by a static, hand-maintained pricing table.
  Costs are returned in **USD decimal dollars** (never cents).
- **Normalize** — `generateId`, `normalizeEvent`, `normalizeError`,
  `calculateDuration`.

```ts
import { calculateCost } from "@agent-replay/core";
calculateCost("gpt-4o", 1000, 500); // → 0.0075
```

Pricing is a snapshot and may drift from current provider prices — treat costs
as estimates.

MIT licensed.
