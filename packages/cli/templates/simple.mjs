// Agent Replay — simple example. No API key required.
//
// Run:
//   1. Start Studio:   pnpm dev   (or: agent-replay dev)
//   2. Run this file:  node __OUT__
//   3. View the trace: __ENDPOINT__
//
// Requires @agent-replay/sdk (already available inside the repo;
// otherwise: npm i @agent-replay/sdk).

import { createReplay } from "@agent-replay/sdk/simple";

const replay = createReplay({ endpoint: "__ENDPOINT__" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await replay.record("Simple Agent", async (run) => {
  const docs = await run.step("Search docs", async () => {
    await sleep(200);
    return ["doc-1", "doc-2", "doc-3"];
  });

  const answer = await run.model(
    "openai:gpt-4o",
    { messages: [{ role: "user", content: "Summarize the docs" }] },
    async () => {
      await sleep(300);
      return {
        response: `Summary of ${docs.length} docs.`,
        inputTokens: 120,
        outputTokens: 40,
      };
    },
  );

  return answer.response;
});

await replay.shutdown();
console.log("Done. Open __ENDPOINT__ and look for the 'Simple Agent' trace.");
