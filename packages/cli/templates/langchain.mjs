// Agent Replay — LangChain example.
//
// ⚠️  This calls the REAL OpenAI API (via LangChain) and may cost money.
//
// Setup:
//   1. npm i @langchain/openai @langchain/core
//   2. export OPENAI_API_KEY=sk-...   (PowerShell: $env:OPENAI_API_KEY="sk-...")
//   3. Start Studio:   pnpm dev   (or: agent-replay dev)
//   4. Run this file:  node __OUT__
//   5. View the trace: __ENDPOINT__

import { ChatOpenAI } from "@langchain/openai";
import { createReplay } from "@agent-replay/sdk/simple";
import { createLangChainCallbackHandler } from "@agent-replay/sdk/integrations/langchain";

if (!process.env.OPENAI_API_KEY) {
  console.error("Set OPENAI_API_KEY before running this example.");
  process.exit(1);
}

const replay = createReplay({ endpoint: "__ENDPOINT__" });
const handler = createLangChainCallbackHandler();

const model = new ChatOpenAI({ model: "gpt-4o-mini" });

await replay.record("LangChain Agent", async () => {
  const res = await model.invoke(
    [{ role: "user", content: "Say hello in one short sentence." }],
    { callbacks: [handler] },
  );
  console.log(res.content);
});

await replay.shutdown();
console.log("Done. Open __ENDPOINT__ and look for the 'LangChain Agent' trace.");
