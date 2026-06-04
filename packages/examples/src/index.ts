// @agent-replay/examples — demo agents for StepLens

import { runBasicAgent } from "./basic-agent.js";
import { runToolCallingAgent } from "./tool-calling-agent.js";
import { runFailingAgent } from "./failing-agent.js";

export { runBasicAgent } from "./basic-agent.js";
export { runToolCallingAgent } from "./tool-calling-agent.js";
export { runFailingAgent } from "./failing-agent.js";

/**
 * Run all demo agents in sequence against a running Studio instance.
 * Records to `endpoint` (default http://localhost:3000) and flushes on exit.
 */
export async function runAllDemos(endpoint = "http://localhost:3000") {
  const { createClient } = await import("@agent-replay/sdk");
  const results: Array<{ agent: string; traceId: string }> = [];

  console.log("Running demo agents...\n");

  // A single client buffers all three traces; shutdown() flushes them.
  const client = createClient({ endpoint });

  results.push({ agent: "Research Assistant", traceId: await runBasicAgent(client) });
  console.log("  ✓ Research Assistant");

  results.push({ agent: "Tool-Calling Agent", traceId: await runToolCallingAgent(client) });
  console.log("  ✓ Tool-Calling Agent");

  results.push({ agent: "Failing Agent", traceId: await runFailingAgent(client) });
  console.log("  ✓ Failing Agent");

  // Flush all buffered events before returning.
  await client.shutdown();

  console.log(`\nRecorded 3 traces. Open ${endpoint} to explore them.`);
  return results;
}
