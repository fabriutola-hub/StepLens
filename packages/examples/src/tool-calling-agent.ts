import type { AgentReplayClient } from "@agent-replay/sdk";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * "Tool-Calling Agent" — complex multi-tool orchestration:
 *   7 spans, 4 tool calls (search, calculator, file_read, api_call), 5 model calls.
 *   Demonstrates parallel spans, nested spans, and mixed tool/model usage.
 */
export async function runToolCallingAgent(client: AgentReplayClient) {
  const trace = client.startTrace("Tool-Calling Agent", {
    input: "Analyze my Q3 expenses, compare with budget, and generate a report",
    metadata: { agent: "financial-analyst-v2" },
  });

  // ── Phase 1: Parse & Plan ──────────────────────────────────────────
  const parseSpan = trace.startSpan("parse_request", {
    kind: "parser",
  });

  const planModelSpan = trace.startSpan("gpt-4o_planner", {
    kind: "model",
    parentId: parseSpan.id,
  });
  await sleep(400);
  trace.recordModelCall({
    provider: "openai",
    model: "gpt-4o",
    messages: [
      { role: "system", content: "You are a financial analysis planner. Decompose user requests into tool calls." },
      { role: "user", content: "Analyze my Q3 expenses, compare with budget, and generate a report." },
    ],
    response: 'Plan:\n1. Load expense data (file_read)\n2. Load budget data (file_read)\n3. Calculate totals (calculator)\n4. Compare vs budget (calculator)\n5. Search for industry benchmarks (web_search)\n6. Generate final report',
    inputTokens: 95,
    outputTokens: 72,
    spanId: planModelSpan.id,
  });
  planModelSpan.end();
  parseSpan.end();

  // ── Phase 2: Load data (parallel spans) ────────────────────────────
  const dataLoadSpan = trace.startSpan("load_data", {
    kind: "agent",
    parentId: parseSpan.id,
  });

  // Parallel child: read expenses
  const expensesSpan = trace.startSpan("read_expenses", {
    kind: "tool",
    parentId: dataLoadSpan.id,
  });
  await sleep(200);
  trace.recordToolCall({
    toolName: "file_read",
    input: { path: "/data/q3_expenses.json" },
    output: {
      rows: [
        { category: "Cloud Infrastructure", amount: 45000 },
        { category: "Salaries", amount: 120000 },
        { category: "Office Rent", amount: 18000 },
        { category: "Marketing", amount: 32000 },
        { category: "Software Licenses", amount: 8500 },
        { category: "Travel", amount: 12000 },
      ],
      total: 235500,
    },
    status: "success",
    spanId: expensesSpan.id,
  });
  expensesSpan.end();

  // Parallel child: read budget
  const budgetSpan = trace.startSpan("read_budget", {
    kind: "tool",
    parentId: dataLoadSpan.id,
  });
  await sleep(180);
  trace.recordToolCall({
    toolName: "file_read",
    input: { path: "/data/q3_budget.json" },
    output: {
      rows: [
        { category: "Cloud Infrastructure", budget: 40000 },
        { category: "Salaries", budget: 120000 },
        { category: "Office Rent", budget: 20000 },
        { category: "Marketing", budget: 25000 },
        { category: "Software Licenses", budget: 10000 },
        { category: "Travel", budget: 15000 },
      ],
      total: 230000,
    },
    status: "success",
    spanId: budgetSpan.id,
  });
  budgetSpan.end();
  dataLoadSpan.end();

  // ── Phase 3: Calculate & Compare ───────────────────────────────────
  const calcSpan = trace.startSpan("calculate_comparison", {
    kind: "agent",
    parentId: dataLoadSpan.id,
  });

  // Sequential tool calls in calc span
  const totalExpenseSpan = trace.startSpan("sum_expenses", {
    kind: "tool",
    parentId: calcSpan.id,
  });
  await sleep(120);
  trace.recordToolCall({
    toolName: "calculator",
    input: { expr: "45000 + 120000 + 18000 + 32000 + 8500 + 12000" },
    output: { result: 235500 },
    status: "success",
    spanId: totalExpenseSpan.id,
  });
  totalExpenseSpan.end();

  const diffSpan = trace.startSpan("budget_diff", {
    kind: "tool",
    parentId: calcSpan.id,
  });
  await sleep(100);
  trace.recordToolCall({
    toolName: "calculator",
    input: { expr: "235500 - 230000" },
    output: { result: 5500 },
    status: "success",
    spanId: diffSpan.id,
  });
  diffSpan.end();
  calcSpan.end();

  // ── Phase 4: Research benchmarks ───────────────────────────────────
  const benchmarkSpan = trace.startSpan("industry_benchmarks", {
    kind: "agent",
    parentId: dataLoadSpan.parentId,
  });

  const searchSpan = trace.startSpan("web_search", {
    kind: "tool",
    parentId: benchmarkSpan.id,
  });
  await sleep(300);
  trace.recordToolCall({
    toolName: "web_search",
    input: { query: "Q3 2025 cloud infrastructure spending benchmarks" },
    output: {
      results: [
        { title: "Cloud spending up 23% YoY", snippet: "Industry average cloud spend: $42K/quarter for mid-size companies." },
        { title: "IT Budget Benchmarks 2025", snippet: "Recommended cloud-to-total-IT ratio: 18-22%." },
      ],
    },
    status: "success",
    spanId: searchSpan.id,
  });

  const benchmarkModelSpan = trace.startSpan("claude_analysis", {
    kind: "model",
    parentId: searchSpan.id,
  });
  await sleep(500);
  trace.recordModelCall({
    provider: "anthropic",
    model: "claude-3-5-sonnet-20241022",
    messages: [
      { role: "user", content: "Analyze: We spend $45K on cloud (19.1% of $235.5K total IT). Industry avg: $42K. Cloud-to-IT ratio: 18-22%. Is our spending reasonable?" },
    ],
    response: "Your cloud spend of $45K at 19.1% of total IT spend is within the recommended 18-22% range. However, at $3K above the $42K industry median, there may be optimization opportunities. Specific areas to investigate: reserved instances vs on-demand, storage tiering, and unused resource cleanup.",
    inputTokens: 130,
    outputTokens: 95,
    spanId: benchmarkModelSpan.id,
  });
  benchmarkModelSpan.end();
  searchSpan.end();
  benchmarkSpan.end();

  // ── Phase 5: Generate Report ───────────────────────────────────────
  const reportSpan = trace.startSpan("generate_report", {
    kind: "agent",
    parentId: benchmarkSpan.id,
  });

  const draftModelSpan = trace.startSpan("gpt-4o_report_draft", {
    kind: "model",
    parentId: reportSpan.id,
  });
  await sleep(700);
  trace.recordModelCall({
    provider: "openai",
    model: "gpt-4o",
    messages: [
      { role: "system", content: "Generate a structured financial report in markdown." },
      { role: "user", content: "Create a Q3 expense report:\n\nData:\n- Total expenses: $235,500\n- Budget: $230,000\n- Over budget by: $5,500 (2.4%)\n\nBreakdown:\n- Cloud: $45,000 (budget $40,000) \u26A0\n- Salaries: $120,000 (budget $120,000) \u2705\n- Office: $18,000 (budget $20,000) \u2705\n- Marketing: $32,000 (budget $25,000) \u26A0\n- Software: $8,500 (budget $10,000) \u2705\n- Travel: $12,000 (budget $15,000) \u2705\n\nInclude sections: Executive Summary, Budget vs Actual, Risk Areas, Recommendations." },
    ],
    response: "# Q3 2024 Expense Report\n\n## Executive Summary\nTotal Q3 expenses reached $235,500 against a $230,000 budget — an overage of $5,500 (2.4%). While most categories stayed within budget, Cloud Infrastructure (+$5,000) and Marketing (+$7,000) exceeded allocations, partially offset by savings in Office Rent (-$2,000), Software Licenses (-$1,500), and Travel (-$3,000).\n\n## Budget vs Actual\n| Category | Budget | Actual | Variance |\n|---|---|---|---|\n| Cloud Infrastructure | $40,000 | $45,000 | +$5,000 \u26A0 |\n| Salaries | $120,000 | $120,000 | $0 \u2705 |\n| Office Rent | $20,000 | $18,000 | -$2,000 \u2705 |\n| Marketing | $25,000 | $32,000 | +$7,000 \u26A0 |\n| Software Licenses | $10,000 | $8,500 | -$1,500 \u2705 |\n| Travel | $15,000 | $12,000 | -$3,000 \u2705 |\n\n## Risk Areas\n1. **Cloud Infrastructure**: 12.5% over budget. Investigate reserved instance adoption and storage optimization.\n2. **Marketing**: 28% over budget. Campaign performance ROI should be reviewed.\n\n## Recommendations\n1. Implement FinOps cloud cost management by Q4\n2. Review marketing campaign attribution and pause underperforming channels\n3. Maintain current discipline in Office, Software, and Travel categories",
    inputTokens: 310,
    outputTokens: 380,
    spanId: draftModelSpan.id,
  });
  draftModelSpan.end();

  const reviewModelSpan = trace.startSpan("gpt-4o_review", {
    kind: "model",
    parentId: reportSpan.id,
  });
  await sleep(350);
  trace.recordModelCall({
    provider: "openai",
    model: "gpt-4o",
    messages: [
      { role: "system", content: "Review and refine the report. Check for accuracy and add action items with owners." },
      { role: "user", content: "Review this Q3 expense report and add actionable next steps with owners." },
    ],
    response: "Report approved with additions:\n\n**Action Items:**\n1. Cloud cost audit — Finance Team (due Oct 15)\n2. Marketing ROI review — CMO (due Oct 20)\n3. Q4 budget revision incorporating findings — Finance Lead (due Oct 25)",
    inputTokens: 420,
    outputTokens: 65,
    spanId: reviewModelSpan.id,
  });
  reviewModelSpan.end();
  reportSpan.end();

  trace.end();
  return trace.id;
}
