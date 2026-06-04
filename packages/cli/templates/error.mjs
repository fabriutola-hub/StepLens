// Agent Replay — error-handling example. No API key required.
//
// Run:
//   1. Start Studio:   pnpm dev   (or: agent-replay dev)
//   2. Run this file:  node __OUT__
//   3. View the trace: __ENDPOINT__
//
// Shows how a thrown error marks the step + trace as failed (and is re-thrown).

import { createReplay } from "@agent-replay/sdk/simple";

const replay = createReplay({ endpoint: "__ENDPOINT__" });

try {
  await replay.record("Failing Agent", async (run) => {
    await run.step("Load data", async () => ({ rows: 3 }));

    await run.step("Process", async () => {
      throw new Error("Boom: processing failed at row 2");
    });
  });
} catch (err) {
  console.error("Agent failed (as expected):", err.message);
}

await replay.shutdown();
console.log("Done. Open __ENDPOINT__ and look for the failed 'Failing Agent' trace.");
