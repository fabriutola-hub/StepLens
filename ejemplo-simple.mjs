// Minimal Agent Replay example.
//
// Prerequisites:
//   1. Build the SDK:   pnpm build
//   2. Start Studio:    pnpm dev   (serves http://localhost:3000)
//   3. Run this file:   node ejemplo-simple.mjs
//
// Then open http://localhost:3000 and look for the "Mi agente simple" trace.

import { createClient } from "./packages/sdk/dist/index.js";

// Reads AGENT_REPLAY_ENDPOINT / AGENT_REPLAY_ENABLED from the env,
// and defaults to http://localhost:3000.
const replay = createClient();

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function miAgente(pregunta) {
  // `run` opens a trace, ends it on success, and marks it failed on error.
  return replay.run(
    "Mi agente simple",
    async (trace) => {
      const recibir = trace.startSpan("Recibir pregunta", { kind: "agent" });
      await esperar(300);
      recibir.end();

      const pensar = trace.startSpan("Pensar respuesta", { kind: "model" });
      await esperar(800);
      trace.recordModelCall({
        provider: "openai",
        model: "gpt-4o",
        messages: [{ role: "user", content: pregunta }],
        response: `Respuesta para: ${pregunta}`,
        inputTokens: 24,
        outputTokens: 12,
        spanId: pensar.id,
      });
      pensar.end();

      return `Respuesta para: ${pregunta}`;
    },
    { input: pregunta },
  );
}

const respuesta = await miAgente("Hola, ¿cómo funciona esto?");
console.log(respuesta);

// Flush buffered events before the process exits.
await replay.shutdown();

console.log("Listo. Abre http://localhost:3000 y busca la traza 'Mi agente simple'.");
