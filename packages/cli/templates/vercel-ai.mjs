// Agent Replay — Vercel AI SDK example.
//
// ⚠️  This calls the REAL OpenAI API (via the Vercel AI SDK) and may cost money.
//
// Setup:
//   1. npm i ai @ai-sdk/openai
//   2. export OPENAI_API_KEY=sk-...   (PowerShell: $env:OPENAI_API_KEY="sk-...")
//   3. Start Studio:   pnpm dev   (or: agent-replay dev)
//   4. Run this file:  node __OUT__
//   5. View the trace: __ENDPOINT__

import { generateText, streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { createReplay } from "@agent-replay/sdk/simple";
import { wrapAISDK } from "@agent-replay/sdk/integrations/vercel-ai";

if (!process.env.OPENAI_API_KEY) {
  console.error("Set OPENAI_API_KEY before running this example.");
  process.exit(1);
}

const replay = createReplay({ endpoint: "__ENDPOINT__" });
const ai = wrapAISDK({ generateText, streamText }, { replay });

await replay.record("Vercel AI SDK Agent", async () => {
  // generateText — recorded when the result resolves.
  const { text } = await ai.generateText({
    model: openai("gpt-4o-mini"),
    prompt: "Say hello in one short sentence.",
  });
  console.log(text);

  // streamText — recorded via onFinish once the stream completes.
  const result = ai.streamText({
    model: openai("gpt-4o-mini"),
    prompt: "Count from 1 to 5.",
  });
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }
  process.stdout.write("\n");
});

await replay.shutdown();
console.log("Done. Open __ENDPOINT__ and look for the 'Vercel AI SDK Agent' trace.");
