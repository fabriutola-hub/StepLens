// @agent-replay/cli — command-line interface for StepLens

import { Command } from "commander";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";

const CLI_VERSION = "0.8.0";
const DEFAULT_ENDPOINT = "http://localhost:3000";

const program = new Command();

program
  .name("steplens")
  .description("Local-first trace inspector for AI agents — record, list, and visualize traces in Studio")
  .version(CLI_VERSION);

// ── helpers ─────────────────────────────────────────────────────────────────

/** Detect whether we're running inside the StepLens monorepo. */
function isMonorepo(): boolean {
  // Walk up from cwd looking for pnpm-workspace.yaml
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return true;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return false;
}

/** Try to resolve the @agent-replay/studio package location. */
function resolveStudioPackage(): string | null {
  const req = createRequire(import.meta.url);
  try {
    const studioPkg = req.resolve("@agent-replay/studio/package.json");
    return dirname(studioPkg);
  } catch {
    return null;
  }
}

/** Try to resolve the `next` binary from the studio package. */
function resolveNextBin(studioDir: string): string | null {
  const candidates = [
    join(studioDir, "node_modules", ".bin", "next"),
    join(studioDir, "node_modules", "next", "dist", "bin", "next"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // Fallback: try to resolve from studio's node_modules
  const req = createRequire(join(studioDir, "package.json"));
  try {
    const nextBin = req.resolve("next/dist/bin/next");
    return nextBin;
  } catch {
    return null;
  }
}

function openBrowser(url: string): void {
  import("node:child_process").then(({ exec }) => {
    const p = process.platform;
    if (p === "win32") exec(`start ${url}`);
    else if (p === "darwin") exec(`open ${url}`);
    else exec(`xdg-open ${url}`);
  });
}

// ── dev ─────────────────────────────────────────────────────────────────────
program
  .command("dev")
  .description("Start the StepLens Studio server and open the browser")
  .option("-p, --port <port>", "port to run on", "3000")
  .option("--host <host>", "hostname to bind to", "127.0.0.1")
  .option("--no-open", "don't open browser automatically")
  .action(async (options: { port: string; host: string; open: boolean }) => {
    const { spawn } = await import("node:child_process");
    const port = options.port;
    const host = options.host;

    if (host === "0.0.0.0") {
      console.warn("⚠  Binding to 0.0.0.0 — Studio has no authentication. Use with caution on shared networks.");
    }

    // If we're inside the monorepo, use pnpm filter for dev mode
    if (isMonorepo()) {
      console.log("Starting StepLens (monorepo mode)...");
      const child = spawn("pnpm", ["--filter", "@agent-replay/studio", "dev"], {
        cwd: process.cwd(),
        stdio: "inherit",
        env: Object.assign({}, process.env, { PORT: port, HOSTNAME: host }),
        shell: true,
      });

      if (options.open !== false) {
        setTimeout(() => openBrowser(`http://localhost:${port}`), 3000);
      }

      child.on("close", (code: number | null) => process.exit(code ?? 0));
      return;
    }

    // Standalone mode: find the installed studio package and run next start
    console.log("Starting StepLens (standalone mode)...");
    const studioDir = resolveStudioPackage();
    if (!studioDir) {
      console.error("Error: could not locate @agent-replay/studio package.");
      console.error("Make sure it is installed: npm install @agent-replay/studio");
      process.exit(1);
      return;
    }

    const nextBin = resolveNextBin(studioDir);
    if (!nextBin) {
      console.error("Error: could not locate Next.js binary within @agent-replay/studio.");
      process.exit(1);
      return;
    }

    const child = spawn("node", [nextBin, "start", "-p", port, "-H", host], {
      cwd: studioDir,
      stdio: "inherit",
      env: Object.assign({}, process.env, { PORT: port, HOSTNAME: host, NODE_ENV: "production" }),
    });

    if (options.open !== false) {
      setTimeout(() => openBrowser(`http://localhost:${port}`), 2000);
    }

    child.on("close", (code: number | null) => process.exit(code ?? 0));
  });

// ── doctor ──────────────────────────────────────────────────────────────────
program
  .command("doctor")
  .description("Check system requirements for StepLens")
  .option("-e, --endpoint <url>", "Studio API endpoint", DEFAULT_ENDPOINT)
  .action(async (options: { endpoint: string }) => {
    const endpoint = options.endpoint.replace(/\/+$/, "");
    console.log("StepLens — System Check\n");
    let allOk = true;

    const nodeVersion = process.versions.node;
    const major = parseInt(nodeVersion.split(".")[0], 10);
    if (major >= 18) console.log(`  ✓ Node.js ${nodeVersion}`);
    else { console.log(`  ✗ Node.js ${nodeVersion} (>= 18 required)`); allOk = false; }

    // Only check pnpm when inside the monorepo
    if (isMonorepo()) {
      try {
        const { execSync } = await import("node:child_process");
        const pnpmVer = execSync("pnpm --version", { encoding: "utf-8", timeout: 5000 }).trim();
        console.log(`  ✓ pnpm ${pnpmVer}`);
      } catch {
        console.log("  ✗ pnpm not found (required for monorepo development)");
        allOk = false;
      }
    }

    try {
      const Database = (await import("better-sqlite3")).default;
      const db = new Database(":memory:");
      db.pragma("journal_mode = WAL");
      db.close();
      console.log("  ✓ SQLite (better-sqlite3) available");
    } catch {
      console.log("  ✗ SQLite (better-sqlite3) not available");
      allOk = false;
    }

    try {
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(2000) });
      if (res.ok) console.log(`  ✓ Studio reachable at ${endpoint}`);
      else { console.log(`  ✗ Studio returned status ${res.status}`); allOk = false; }
    } catch {
      console.log(`  - Studio not running at ${endpoint} (start it with \`npx steplens dev\`)`);
    }

    console.log("");
    if (allOk) console.log("All checks passed. Ready to use StepLens.");
    else { console.log("Some checks failed. Please fix the issues above."); process.exit(1); }
  });

// ── init ────────────────────────────────────────────────────────────────────
program
  .command("init")
  .description("Create a .env with the StepLens environment variables the SDK reads")
  .option("-e, --endpoint <url>", "Studio API endpoint", DEFAULT_ENDPOINT)
  .option("-f, --force", "overwrite an existing .env", false)
  .action(async (options: { endpoint: string; force: boolean }) => {
    const { writeFileSync } = await import("node:fs");
    const envPath = resolve(process.cwd(), ".env");

    if (existsSync(envPath) && !options.force) {
      console.log(`.env already exists at ${envPath}`);
      console.log("Re-run with --force to overwrite, or add these lines manually:\n");
      console.log(`  AGENT_REPLAY_ENDPOINT=${options.endpoint}`);
      console.log(`  AGENT_REPLAY_ENABLED=true`);
      return;
    }

    const content = `# StepLens — read by @agent-replay/sdk's createClient()
# Studio serves both the UI and the ingest API at this URL.
AGENT_REPLAY_ENDPOINT=${options.endpoint}
# Set to false to disable recording without touching your code.
AGENT_REPLAY_ENABLED=true
`;
    writeFileSync(envPath, content, "utf-8");
    console.log(`Created ${envPath}`);
    console.log("\nNext steps:");
    console.log("  1. Start Studio:        npx steplens dev");
    console.log("  2. Load the .env in your app (e.g. `node --env-file=.env your-agent.js`)");
    console.log("  3. Record traces with `createClient()` from @agent-replay/sdk");
  });

// ── export ──────────────────────────────────────────────────────────────────
program
  .command("export")
  .description("Export a trace to a JSON file")
  .argument("<traceId>", "ID of the trace to export")
  .option("-e, --endpoint <url>", "Studio API endpoint", DEFAULT_ENDPOINT)
  .option("-o, --output <path>", "Output directory", "./exports")
  .action(async (traceId: string, options: { endpoint: string; output: string }) => {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    const apiUrl = options.endpoint.replace(/\/+$/, "");
    const outputDir = resolve(process.cwd(), options.output);

    try {
      const res = await fetch(`${apiUrl}/api/export/${traceId}`, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) {
        console.error(res.status === 404 ? `Error: Trace "${traceId}" not found.` : `Error: API returned ${res.status}`);
        process.exit(1);
      }
      const data = await res.text();
      mkdirSync(outputDir, { recursive: true });
      const outputPath = resolve(outputDir, `trace-${traceId}.json`);
      writeFileSync(outputPath, data, "utf-8");
      console.log(`Trace exported to ${outputPath}`);
    } catch (err: unknown) {
      console.error("Error:", (err as Error).message);
      process.exit(1);
    }
  });

// ── record ──────────────────────────────────────────────────────────────────
program
  .command("record")
  .description("Run a command with StepLens env vars set. The command must use @agent-replay/sdk to record traces.")
  .option("-e, --endpoint <url>", "Studio API endpoint", DEFAULT_ENDPOINT)
  .allowUnknownOption()
  .allowExcessArguments()
  .action(async (options: { endpoint: string }) => {
    const rawArgs = process.argv;
    const dashIdx = rawArgs.indexOf("--");
    if (dashIdx === -1 || dashIdx >= rawArgs.length - 1) {
      console.error("Error: No command specified. Use: steplens record -- <command>");
      console.error("Example: steplens record -- node my-agent.js");
      process.exit(1);
    }
    const actualCmd = rawArgs.slice(dashIdx + 1);
    const endpoint = options.endpoint.replace(/\/+$/, "");
    console.log(`Running with AGENT_REPLAY_ENDPOINT=${endpoint}: ${actualCmd.join(" ")}`);

    const { spawn } = await import("node:child_process");
    const child = spawn(actualCmd[0], actualCmd.slice(1), {
      stdio: "inherit",
      shell: true,
      env: Object.assign({}, process.env, {
        AGENT_REPLAY_ENDPOINT: endpoint,
        AGENT_REPLAY_ENABLED: "true",
      }),
    });
    child.on("close", (code: number | null) => {
      console.log(`\nCommand exited with code ${code}.`);
      console.log(`If it recorded traces, view them at ${endpoint}`);
      process.exit(code ?? 0);
    });
  });

// ── demo ────────────────────────────────────────────────────────────────────
program
  .command("demo")
  .description("Record three example agent traces and send them to Studio")
  .option("-e, --endpoint <url>", "Studio API endpoint", DEFAULT_ENDPOINT)
  .action(async (options: { endpoint: string }) => {
    const endpoint = options.endpoint.replace(/\/+$/, "");

    let reachable = false;
    try {
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(1500) });
      reachable = res.ok || res.status === 304;
    } catch {
      reachable = false;
    }

    if (!reachable) {
      console.error(`Studio is not reachable at ${endpoint}.`);
      console.error("Start it first (`npx steplens dev`), then re-run `npx steplens demo`.");
      process.exit(1);
    }

    const { runBasicAgent, runToolCallingAgent, runFailingAgent } = await import("@agent-replay/examples");
    const { createClient } = await import("@agent-replay/sdk");

    console.log("Recording demo agents...\n");
    const client = createClient({ endpoint });

    await runBasicAgent(client);
    console.log("  ✓ Research Assistant");
    await runToolCallingAgent(client);
    console.log("  ✓ Tool-Calling Agent");
    await runFailingAgent(client);
    console.log("  ✓ Failing Agent");

    await client.shutdown();

    console.log(`\nRecorded 3 traces. Open ${endpoint} to explore them.`);
    process.exit(0);
  });

// ── new ─────────────────────────────────────────────────────────────────────
const TEMPLATES = [
  "simple",
  "error",
  "openai",
  "ollama",
  "vercel-ai",
  "anthropic",
  "google",
  "langchain",
] as const;
type TemplateName = (typeof TEMPLATES)[number];

const TEMPLATE_REQUIREMENTS: Partial<
  Record<TemplateName, { api: string; env: string; install: string }>
> = {
  openai: { api: "OpenAI", env: "OPENAI_API_KEY", install: "npm i openai" },
  "vercel-ai": {
    api: "OpenAI (via the Vercel AI SDK)",
    env: "OPENAI_API_KEY",
    install: "npm i ai @ai-sdk/openai",
  },
  anthropic: {
    api: "Anthropic",
    env: "ANTHROPIC_API_KEY",
    install: "npm i @anthropic-ai/sdk",
  },
  google: {
    api: "Google Gemini",
    env: "GEMINI_API_KEY",
    install: "npm i @google/genai",
  },
  langchain: {
    api: "OpenAI (via LangChain)",
    env: "OPENAI_API_KEY",
    install: "npm i @langchain/openai @langchain/core",
  },
};

program
  .command("new")
  .description(`Generate a runnable example file (${TEMPLATES.join(", ")})`)
  .argument("[template]", `template to generate (${TEMPLATES.join("|")})`, "simple")
  .option("-o, --out <path>", "output file path", "steplens-example.mjs")
  .option("-e, --endpoint <url>", "Studio API endpoint", DEFAULT_ENDPOINT)
  .option("-f, --force", "overwrite the output file if it exists", false)
  .action(async (template: string, options: { out: string; endpoint: string; force: boolean }) => {
    if (!TEMPLATES.includes(template as TemplateName)) {
      console.error(`Error: unknown template "${template}". Available: ${TEMPLATES.join(", ")}`);
      process.exit(1);
    }

    const { readFileSync, writeFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");

    const outPath = resolve(process.cwd(), options.out);
    if (existsSync(outPath) && !options.force) {
      console.error(`Error: ${outPath} already exists. Re-run with --force to overwrite.`);
      process.exit(1);
    }

    const endpoint = options.endpoint.replace(/\/+$/, "");
    const templatePath = fileURLToPath(new URL(`../templates/${template}.mjs`, import.meta.url));
    let content: string;
    try {
      content = readFileSync(templatePath, "utf-8");
    } catch {
      console.error(`Error: template "${template}" could not be loaded.`);
      process.exit(1);
      return;
    }
    content = content
      .replaceAll("__ENDPOINT__", endpoint)
      .replaceAll("__OUT__", options.out);
    writeFileSync(outPath, content, "utf-8");

    console.log(`Created ${outPath}`);
    const requirements = TEMPLATE_REQUIREMENTS[template as TemplateName];
    if (requirements) {
      console.log(`\n⚠  This example calls the real ${requirements.api} API and may cost money.`);
      console.log(`   Set ${requirements.env} and run \`${requirements.install}\` before running it.`);
    }
    console.log("\nNext steps:");
    console.log("  1. Start Studio:    npx steplens dev");
    console.log(`  2. Run the file:    node ${options.out}`);
    console.log(`  3. View the trace:  ${endpoint}`);
  });

// ── import ──────────────────────────────────────────────────────────────────
program
  .command("import")
  .description("Import a trace from a JSON file (as produced by `export`) into Studio")
  .argument("<file>", "path to the trace JSON file")
  .option("-e, --endpoint <url>", "Studio API endpoint", DEFAULT_ENDPOINT)
  .option("--replace", "replace the trace if one with the same id already exists", false)
  .action(async (file: string, options: { endpoint: string; replace: boolean }) => {
    const { readFileSync } = await import("node:fs");
    const filePath = resolve(process.cwd(), file);

    if (!existsSync(filePath)) {
      console.error(`Error: file not found: ${filePath}`);
      process.exit(1);
    }

    let body: string;
    try {
      body = readFileSync(filePath, "utf-8");
      JSON.parse(body);
    } catch (err: unknown) {
      console.error(`Error: invalid JSON in ${file}: ${(err as Error).message}`);
      process.exit(1);
      return;
    }

    const endpoint = options.endpoint.replace(/\/+$/, "");
    const url = `${endpoint}/api/import${options.replace ? "?replace=true" : ""}`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(15000),
      });

      if (res.status === 409) {
        console.error("Error: a trace with that id already exists. Re-run with --replace to overwrite it.");
        process.exit(1);
      }
      if (!res.ok) {
        console.error(`Error: import failed (${res.status} ${res.statusText}).`);
        process.exit(1);
      }

      const data = (await res.json()) as { traceId?: string };
      console.log(`Imported trace ${data.traceId ?? ""}. Open ${endpoint} to view it.`);
    } catch (err: unknown) {
      console.error(`Error: could not reach Studio at ${endpoint}. Is it running? (${(err as Error).message})`);
      process.exit(1);
    }
  });

// ── status ──────────────────────────────────────────────────────────────────
program
  .command("status")
  .description("Check if a StepLens Studio instance is alive and show basic info")
  .option("-e, --endpoint <url>", "Studio API endpoint", DEFAULT_ENDPOINT)
  .action(async (options: { endpoint: string }) => {
    const endpoint = options.endpoint.replace(/\/+$/, "");
    try {
      const res = await fetch(`${endpoint}/api/traces`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        console.error(`Studio returned status ${res.status} at ${endpoint}`);
        process.exit(1);
      }
      const data = (await res.json()) as unknown[];
      console.log(`✓ Studio is alive at ${endpoint}`);
      console.log(`  Traces: ${Array.isArray(data) ? data.length : "unknown"}`);
    } catch (err: unknown) {
      console.error(`✗ Studio not reachable at ${endpoint}: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ── open ────────────────────────────────────────────────────────────────────
program
  .command("open")
  .description("Open the StepLens Studio UI in the default browser")
  .option("-e, --endpoint <url>", "Studio API endpoint", DEFAULT_ENDPOINT)
  .action(async (options: { endpoint: string }) => {
    const endpoint = options.endpoint.replace(/\/+$/, "");
    console.log(`Opening ${endpoint} ...`);
    openBrowser(endpoint);
  });

// ── otel ────────────────────────────────────────────────────────────────────
const otel = program
  .command("otel")
  .description("OpenTelemetry bridge — export and send traces as OTLP/HTTP JSON");

otel
  .command("export")
  .description("Export a trace as OTLP JSON (from Studio or a local file)")
  .argument("[traceId]", "ID of the trace to export from Studio")
  .option("-e, --endpoint <url>", "Studio API endpoint", DEFAULT_ENDPOINT)
  .option("--file <path>", "read trace from a local JSON file instead of Studio")
  .option("-o, --out <path>", "output file for OTLP JSON", "trace-otlp.json")
  .option("--include-content", "include prompts, responses, and tool payloads", false)
  .action(async (traceId: string | undefined, options: { endpoint: string; file?: string; out: string; includeContent: boolean }) => {
    const { readFileSync, writeFileSync } = await import("node:fs");
    const { toOtlpTrace } = await import("@agent-replay/otel");

    let traceExport: import("@agent-replay/core").TraceExport;

    if (options.file) {
      const filePath = resolve(process.cwd(), options.file);
      if (!existsSync(filePath)) {
        console.error(`Error: file not found: ${filePath}`);
        process.exit(1);
        return;
      }
      try {
        traceExport = JSON.parse(readFileSync(filePath, "utf-8")) as import("@agent-replay/core").TraceExport;
      } catch (err: unknown) {
        console.error(`Error: invalid JSON in ${options.file}: ${(err as Error).message}`);
        process.exit(1);
        return;
      }
    } else if (traceId) {
      const apiUrl = options.endpoint.replace(/\/+$/, "");
      try {
        const res = await fetch(`${apiUrl}/api/export/${traceId}`, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) {
          console.error(res.status === 404 ? `Error: Trace "${traceId}" not found.` : `Error: API returned ${res.status}`);
          process.exit(1);
          return;
        }
        traceExport = (await res.json()) as import("@agent-replay/core").TraceExport;
      } catch (err: unknown) {
        console.error(`Error: could not reach Studio: ${(err as Error).message}`);
        process.exit(1);
        return;
      }
    } else {
      console.error("Error: specify a <traceId> or --file <path>.");
      process.exit(1);
      return;
    }

    const otlp = toOtlpTrace(traceExport!, { includeContent: options.includeContent });
    const outPath = resolve(process.cwd(), options.out);
    writeFileSync(outPath, JSON.stringify(otlp, null, 2), "utf-8");
    console.log(`OTLP trace written to ${outPath}`);
  });

otel
  .command("send")
  .description("Send a trace as OTLP to a collector endpoint")
  .argument("[traceId]", "ID of the trace to send from Studio")
  .option("-e, --endpoint <url>", "Studio API endpoint", DEFAULT_ENDPOINT)
  .option("--file <path>", "read trace from a local JSON file instead of Studio")
  .option("--otlp-endpoint <url>", "OTLP/HTTP endpoint to send traces to")
  .option("--include-content", "include prompts, responses, and tool payloads", false)
  .action(async (traceId: string | undefined, options: { endpoint: string; file?: string; otlpEndpoint?: string; includeContent: boolean }) => {
    const { readFileSync } = await import("node:fs");
    const { sendOtlpTrace, resolveOtlpEndpoint } = await import("@agent-replay/otel");

    let traceExport: import("@agent-replay/core").TraceExport;

    if (options.file) {
      const filePath = resolve(process.cwd(), options.file);
      if (!existsSync(filePath)) {
        console.error(`Error: file not found: ${filePath}`);
        process.exit(1);
        return;
      }
      try {
        traceExport = JSON.parse(readFileSync(filePath, "utf-8")) as import("@agent-replay/core").TraceExport;
      } catch (err: unknown) {
        console.error(`Error: invalid JSON in ${options.file}: ${(err as Error).message}`);
        process.exit(1);
        return;
      }
    } else if (traceId) {
      const apiUrl = options.endpoint.replace(/\/+$/, "");
      try {
        const res = await fetch(`${apiUrl}/api/export/${traceId}`, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) {
          console.error(res.status === 404 ? `Error: Trace "${traceId}" not found.` : `Error: API returned ${res.status}`);
          process.exit(1);
          return;
        }
        traceExport = (await res.json()) as import("@agent-replay/core").TraceExport;
      } catch (err: unknown) {
        console.error(`Error: could not reach Studio: ${(err as Error).message}`);
        process.exit(1);
        return;
      }
    } else {
      console.error("Error: specify a <traceId> or --file <path>.");
      process.exit(1);
      return;
    }

    const otlpEndpoint = resolveOtlpEndpoint(options.otlpEndpoint);
    console.log(`Sending OTLP trace to ${otlpEndpoint} ...`);

    try {
      const res = await sendOtlpTrace(traceExport!, {
        includeContent: options.includeContent,
        otlpEndpoint,
      });
      if (res.ok) {
        console.log(`✓ Trace sent successfully (${res.status})`);
      } else {
        console.error(`✗ Collector returned ${res.status}: ${await res.text()}`);
        process.exit(1);
      }
    } catch (err: unknown) {
      console.error(`Error: could not reach OTLP endpoint: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ── stats ───────────────────────────────────────────────────────────────────
program
  .command("stats")
  .description("Print aggregate trace stats from Studio (no DB connection required)")
  .option("-e, --endpoint <url>", "Studio API endpoint", DEFAULT_ENDPOINT)
  .option("--since <duration>", "only count traces in the last <duration> (e.g. 24h, 7d, 1h)")
  .option("--json", "emit machine-readable JSON instead of human text", false)
  .action(async (options: { endpoint: string; since?: string; json: boolean }) => {
    const since = options.since ? parseSince(options.since) : undefined;
    const qs = new URLSearchParams();
    if (since) qs.set("from", String(since));

    try {
      const res = await fetch(`${options.endpoint}/api/traces/stats?${qs}`);
      if (!res.ok) {
        console.error(`Error: API returned ${res.status}: ${await res.text()}`);
        process.exit(1);
      }
      const stats = (await res.json()) as {
        total: number;
        statusCounts: Record<string, number>;
        totalDurationMs: number;
        avgDurationMs: number;
        p95DurationMs: number;
        totalTokens: number;
        estimatedCostUsd: number;
        modelCounts: Record<string, number>;
        toolCounts: Record<string, number>;
        errorCount: number;
        errorRate: number;
      };

      if (options.json) {
        console.log(JSON.stringify(stats, null, 2));
        return;
      }

      const scope = since ? ` (last ${options.since})` : "";
      console.log(
        `${stats.total} traces${scope} · ${stats.errorCount} errors (${(stats.errorRate * 100).toFixed(1)}%) · $${stats.estimatedCostUsd.toFixed(4)} est.`
      );
      console.log(
        `Duration: avg ${formatDuration(stats.avgDurationMs)} · p95 ${formatDuration(stats.p95DurationMs)}`
      );
      console.log(`Tokens:   ${stats.totalTokens.toLocaleString()}`);
      const topModels = topEntries(stats.modelCounts, 3);
      const topTools = topEntries(stats.toolCounts, 3);
      if (topModels.length > 0) {
        console.log(
          `Top models: ${topModels.map(([k, v]) => `${k} (${v})`).join(", ")}`
        );
      }
      if (topTools.length > 0) {
        console.log(
          `Top tools:  ${topTools.map(([k, v]) => `${k} (${v})`).join(", ")}`
        );
      }
    } catch (err: unknown) {
      console.error(
        `Error: could not reach Studio at ${options.endpoint}: ${(err as Error).message}`
      );
      process.exit(1);
    }
  });

// ── prune ───────────────────────────────────────────────────────────────────
program
  .command("prune")
  .description("Delete traces matching filters; safe by default (--dry-run shows what would be deleted)")
  .option("-e, --endpoint <url>", "Studio API endpoint", DEFAULT_ENDPOINT)
  .option("--older-than <duration>", "only consider traces older than <duration> (e.g. 7d, 30d)")
  .option("--status <status>", "only consider traces with this status")
  .option("--dry-run", "print what would be deleted without deleting", false)
  .option("--yes", "skip the interactive confirm", false)
  .action(
    async (options: {
      endpoint: string;
      olderThan?: string;
      status?: string;
      dryRun: boolean;
      yes: boolean;
    }) => {
      const qs = new URLSearchParams();
      qs.set("limit", "10000");
      if (options.status) qs.set("status", options.status);

      let res: Response;
      try {
        res = await fetch(`${options.endpoint}/api/traces?${qs}`);
      } catch (err: unknown) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
      if (!res.ok) {
        console.error(`Error: list returned ${res.status}: ${await res.text()}`);
        process.exit(1);
      }
      const list = (await res.json()) as {
        traces: Array<{ id: string; name: string; startedAt: number }>;
        total: number;
      };

      // Apply --older-than client-side since /api/traces has a `from` param
      // but not "older than N days"; we filter after the fetch.
      const cutoff = options.olderThan
        ? Date.now() - parseSince(options.olderThan)!
        : 0;
      const matches = list.traces.filter((t) => t.startedAt < cutoff);

      if (matches.length === 0) {
        console.log("No traces match the given filters.");
        return;
      }

      const oldest = matches.reduce(
        (m, t) => (t.startedAt < m ? t.startedAt : m),
        matches[0].startedAt
      );
      const newest = matches.reduce(
        (m, t) => (t.startedAt > m ? t.startedAt : m),
        matches[0].startedAt
      );
      const mode = options.dryRun ? "would delete" : "deleting";
      console.log(`${mode} ${matches.length} trace${matches.length === 1 ? "" : "s"}`);
      console.log(`  oldest: ${new Date(oldest).toISOString().slice(0, 19)}`);
      console.log(`  newest: ${new Date(newest).toISOString().slice(0, 19)}`);

      if (options.dryRun) return;
      if (!options.yes) {
        console.error("Re-run with --yes to confirm, or use --dry-run to inspect first.");
        process.exit(2);
      }

      try {
        const del = await fetch(`${options.endpoint}/api/traces/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ op: "delete", ids: matches.map((t) => t.id) }),
        });
        if (!del.ok) {
          console.error(`Error: bulk delete returned ${del.status}: ${await del.text()}`);
          process.exit(1);
        }
        const result = (await del.json()) as { deleted: number };
        console.log(
          `✓ Deleted ${result.deleted} trace${result.deleted === 1 ? "" : "s"}.`
        );
      } catch (err: unknown) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    }
  );

// ── watch ───────────────────────────────────────────────────────────────────
program
  .command("watch")
  .description("Stream traces from Studio's live SSE endpoint and print them as they happen")
  .option("-e, --endpoint <url>", "Studio API endpoint", DEFAULT_ENDPOINT)
  .option("--format <fmt>", "output format: text|json (default text)", "text")
  .action(async (options: { endpoint: string; format: string }) => {
    const url = `${options.endpoint}/api/events/stream`;
    process.stderr.write(`Connecting to ${url} …\n`);

    const res = await fetch(url, { headers: { Accept: "text/event-stream" } });
    if (!res.ok || !res.body) {
      console.error(`Error: ${res.status} ${res.statusText}`);
      process.exit(1);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    process.stderr.write("Streaming. Press Ctrl+C to stop.\n");

    const stop = async () => {
      process.stderr.write("\nStopped.\n");
      await reader.cancel().catch(() => undefined);
      process.exit(0);
    };
    process.on("SIGINT", () => void stop());

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const event = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const lines = event.split("\n");
          let ev = "message";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) ev = line.slice(7).trim();
            else if (line.startsWith("data: ")) data += line.slice(6);
          }
          if (ev === "trace" && data) {
            try {
              const parsed = JSON.parse(data) as {
                id: string;
                name: string;
                status: string;
                startedAt: number;
              };
              if (options.format === "json") {
                console.log(JSON.stringify(parsed));
              } else {
                const color = STATUS_COLORS[parsed.status] ?? "";
                const reset = color ? "\x1b[0m" : "";
                console.log(
                  `${new Date(parsed.startedAt).toISOString()} ${color}${parsed.status.padEnd(9)}${reset} ${parsed.name}  ${parsed.id.slice(0, 8)}`
                );
              }
            } catch {
              // ignore malformed events
            }
          }
        }
      }
    } catch (err: unknown) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ── Parse ───────────────────────────────────────────────────────────────────
program.parse();

// ── Local helpers ──────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function topEntries(
  counts: Record<string, number>,
  n: number
): Array<[string, number]> {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

const STATUS_COLORS: Record<string, string> = {
  success: "\x1b[32m",   // green
  error: "\x1b[31m",     // red
  running: "\x1b[36m",   // cyan
  cancelled: "\x1b[33m", // yellow
};

function parseSince(value: string): number | null {
  const m = /^(\d+)([smhdw])$/.exec(value.trim());
  if (!m) return null;
  const n = Number(m[1]);
  const mult: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  };
  return Date.now() - n * mult[m[2]];
}
