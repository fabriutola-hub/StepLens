# @agent-replay/sdk

Recording client for [StepLens](https://github.com/fabriutola-hub/StepLens) —
a local-first trace inspector for AI agents. Records spans, model calls, tool
calls, errors, tokens, and estimated cost, and sends them to a local Studio
instance.

```ts
import { createClient } from "@agent-replay/sdk";

const replay = createClient(); // → http://localhost:3000
await replay.run("my-agent", async (trace) => {
  const span = trace.startSpan("search", { kind: "tool" });
  // ... your agent ...
  span.end();
});
await replay.shutdown(); // flush before exit
```

- Reads `AGENT_REPLAY_ENDPOINT` and `AGENT_REPLAY_ENABLED`.
- `MemoryCollector` for offline/testing; `HttpCollector` (default) batches to
  `${endpoint}/api/ingest`.
- Helpers: `withSpan`, `withModelCall`, `withToolCall`.

Full docs: [`docs/sdk.md`](https://github.com/fabriutola-hub/StepLens/blob/main/docs/sdk.md).

MIT licensed.
