import type { AgentReplayClient } from "@agent-replay/sdk";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * "Research Assistant" — linear flow:
 *   3 spans, 2 model calls (GPT-4o), simple research pipeline.
 */
export async function runBasicAgent(client: AgentReplayClient) {
  const trace = client.startTrace("Research Assistant", {
    input: "Research the latest advances in quantum computing and summarize for a technical audience",
    metadata: { agent: "research-assistant-v1" },
  });

  // Span 1: Web search
  const searchSpan = trace.startSpan("web_search", {
    kind: "tool",
    attributes: { engine: "google", query: "quantum computing advances 2025" },
  });
  await sleep(350);
  trace.recordToolCall({
    toolName: "web_search",
    input: { query: "quantum computing advances 2025" },
    output: {
      results: [
        { title: "IBM announces 1,000+ qubit processor", url: "https://ibm.com/quantum", snippet: "IBM's Condor processor reaches 1,121 qubits, paving the way for practical quantum advantage." },
        { title: "Google's Willow chip achieves error correction milestone", url: "https://google.com/research", snippet: "Willow demonstrates exponential error reduction as qubits scale up, a key breakthrough." },
        { title: "Microsoft's topological qubits show promise", url: "https://microsoft.com/quantum", snippet: "Majorana-based qubits demonstrate improved coherence times in latest experiments." },
      ],
    },
    status: "success",
    spanId: searchSpan.id,
  });
  searchSpan.end();
  trace.recordEvent("log", "search_complete", {
    input: { results: 3 },
    parentId: searchSpan.id,
  });

  // Span 2: Analyze with model
  const analysisSpan = trace.startSpan("analyze", {
    kind: "agent",
    parentId: searchSpan.id,
  });

  const modelSpan1 = trace.startSpan("gpt-4o_analysis", {
    kind: "model",
    parentId: analysisSpan.id,
  });
  await sleep(600);
  trace.recordModelCall({
    provider: "openai",
    model: "gpt-4o",
    messages: [
      { role: "system", content: "You are a quantum computing researcher. Analyze the provided search results and extract key themes." },
      { role: "user", content: "Here are the latest quantum computing advances:\n\n1. IBM Condor: 1,121 qubits\n2. Google Willow: error correction milestone\n3. Microsoft: topological qubits\n\nAnalyze and identify the key themes." },
    ],
    response: "Three major themes emerge:\n\n1. **Scaling qubit count** — IBM's Condor at 1,121 qubits shows the industry is rapidly scaling.\n2. **Error correction** — Google's Willow demonstrates that error rates decrease exponentially as qubits scale, a critical breakthrough.\n3. **Novel qubit architectures** — Microsoft's topological approach offers an alternative path to fault-tolerance.",
    inputTokens: 285,
    outputTokens: 112,
    spanId: modelSpan1.id,
  });
  modelSpan1.end();
  analysisSpan.end();

  // Span 3: Summarize
  const summarizeSpan = trace.startSpan("summarize", {
    kind: "parser",
    parentId: analysisSpan.id,
  });

  const modelSpan2 = trace.startSpan("gpt-4o_summary", {
    kind: "model",
    parentId: summarizeSpan.id,
  });
  await sleep(450);
  trace.recordModelCall({
    provider: "openai",
    model: "gpt-4o",
    messages: [
      { role: "system", content: "Create a concise executive summary for a technical audience." },
      { role: "user", content: "Quantum computing advances: scaling (IBM 1,121 qubits), error correction (Google Willow), novel architectures (Microsoft topological). Write a 3-sentence summary." },
    ],
    response: "Quantum computing reached significant milestones in 2025: IBM's Condor processor surpassed 1,000 qubits, Google's Willow chip demonstrated exponential error reduction at scale, and Microsoft advanced topological qubit coherence. These breakthroughs collectively signal that fault-tolerant quantum computing may arrive sooner than previously anticipated. Enterprise teams should begin evaluating quantum-ready algorithms and hybrid classical-quantum architectures.",
    inputTokens: 145,
    outputTokens: 98,
    spanId: modelSpan2.id,
  });
  modelSpan2.end();
  summarizeSpan.end();

  trace.end();
  return trace.id;
}
