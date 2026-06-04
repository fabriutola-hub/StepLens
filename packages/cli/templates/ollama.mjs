// StepLens — Ollama example. No API key required (runs locally).
//
// Setup:
//   1. Install Ollama (https://ollama.com) and pull a model: `ollama pull llama3.2`
//   2. Start Studio:   npx steplens dev
//   3. Run this file:  node __OUT__
//   4. View the trace: __ENDPOINT__
//
// If Ollama isn't running, the example still records a (placeholder) trace so
// you can see the shape in Studio.

import { createReplay } from "@agent-replay/sdk/simple";

const replay = createReplay({ endpoint: "__ENDPOINT__" });

const OLLAMA = process.env.OLLAMA_URL ?? "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "llama3.2";
const PROMPT = "Why is the sky blue? Answer in one sentence.";

await replay.record("Ollama Agent", async (run) => {
  const answer = await run.model(
    `ollama:${MODEL}`,
    { messages: [{ role: "user", content: PROMPT }] },
    async () => {
      try {
        const res = await fetch(`${OLLAMA}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODEL,
            messages: [{ role: "user", content: PROMPT }],
            stream: false,
          }),
        });
        if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
        const data = await res.json();
        return {
          response: data.message?.content ?? "",
          inputTokens: data.prompt_eval_count,
          outputTokens: data.eval_count,
        };
      } catch (err) {
        return { response: `(Ollama unavailable at ${OLLAMA}: ${err.message})` };
      }
    },
  );

  console.log(answer.response);
  return answer.response;
});

await replay.shutdown();
console.log("Done. Open __ENDPOINT__ and look for the 'Ollama Agent' trace.");
