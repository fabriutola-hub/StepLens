// Agent Replay — Anthropic example.
//
// ⚠️  This calls the REAL Anthropic API and may cost money.
//
// Setup:
//   1. npm i @anthropic-ai/sdk
//   2. export ANTHROPIC_API_KEY=sk-ant-...   (PowerShell: $env:ANTHROPIC_API_KEY="sk-ant-...")
//   3. Start Studio:   pnpm dev   (or: agent-replay dev)
//   4. Run this file:  node __OUT__
//   5. View the trace: __ENDPOINT__

import Anthropic from "@anthropic-ai/sdk";
import { createReplay } from "@agent-replay/sdk/simple";
import { wrapAnthropic } from "@agent-replay/sdk/integrations/anthropic";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Set ANTHROPIC_API_KEY before running this example.");
  process.exit(1);
}

const replay = createReplay({ endpoint: "__ENDPOINT__" });
const anthropic = wrapAnthropic(new Anthropic(), { replay });

await replay.record("Anthropic Agent", async () => {
  // messages.create — recorded when the response resolves.
  const message = await anthropic.messages.create({
    model: "claude-3-5-haiku-20241022",
    max_tokens: 256,
    messages: [{ role: "user", content: "Say hello in one short sentence." }],
  });
  console.log(message.content[0]?.text);

  // messages.stream — recorded when you await finalMessage().
  const stream = anthropic.messages.stream({
    model: "claude-3-5-haiku-20241022",
    max_tokens: 256,
    messages: [{ role: "user", content: "Count from 1 to 5." }],
  });
  const final = await stream.finalMessage();
  console.log(final.content[0]?.text);
});

await replay.shutdown();
console.log("Done. Open __ENDPOINT__ and look for the 'Anthropic Agent' trace.");
