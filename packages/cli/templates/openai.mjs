// StepLens — OpenAI example.
//
// ⚠️  This calls the REAL OpenAI API and may cost money.
//
// Setup:
//   1. npm i openai
//   2. export OPENAI_API_KEY=sk-...   (PowerShell: $env:OPENAI_API_KEY="sk-...")
//   3. Start Studio:   npx steplens dev
//   4. Run this file:  node __OUT__
//   5. View the trace: __ENDPOINT__

import OpenAI from "openai";
import { createReplay } from "@agent-replay/sdk/simple";
import { wrapOpenAI } from "@agent-replay/sdk/integrations/openai";

if (!process.env.OPENAI_API_KEY) {
  console.error("Set OPENAI_API_KEY before running this example.");
  process.exit(1);
}

const replay = createReplay({ endpoint: "__ENDPOINT__" });
const openai = wrapOpenAI(new OpenAI(), { replay });

await replay.record("OpenAI Agent", async () => {
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "Say hello in one short sentence." }],
  });
  console.log(res.choices[0]?.message?.content);
});

await replay.shutdown();
console.log("Done. Open __ENDPOINT__ and look for the 'OpenAI Agent' trace.");
