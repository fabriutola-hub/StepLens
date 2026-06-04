// StepLens — Google Gemini example.
//
// ⚠️  This calls the REAL Google Gemini API and may cost money.
//
// Setup:
//   1. npm i @google/genai
//   2. export GEMINI_API_KEY=...   (PowerShell: $env:GEMINI_API_KEY="...")
//   3. Start Studio:   npx steplens dev
//   4. Run this file:  node __OUT__
//   5. View the trace: __ENDPOINT__

import { GoogleGenAI } from "@google/genai";
import { createReplay } from "@agent-replay/sdk/simple";
import { wrapGoogleGenAI } from "@agent-replay/sdk/integrations/google";

if (!process.env.GEMINI_API_KEY) {
  console.error("Set GEMINI_API_KEY before running this example.");
  process.exit(1);
}

const replay = createReplay({ endpoint: "__ENDPOINT__" });
const ai = wrapGoogleGenAI(new GoogleGenAI({}), { replay });

await replay.record("Gemini Agent", async () => {
  // generateContent — recorded when the response resolves.
  const res = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: "Say hello in one short sentence.",
  });
  console.log(res.text);

  // generateContentStream — recorded once the stream is fully consumed.
  const stream = await ai.models.generateContentStream({
    model: "gemini-2.0-flash",
    contents: "Count from 1 to 5.",
  });
  for await (const chunk of stream) {
    process.stdout.write(chunk.text ?? "");
  }
  process.stdout.write("\n");
});

await replay.shutdown();
console.log("Done. Open __ENDPOINT__ and look for the 'Gemini Agent' trace.");
