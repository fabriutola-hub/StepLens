// @agent-replay/cli — command-line interface for StepLens

import { Command } from "commander";

const DEFAULT_ENDPOINT = "http://localhost:3000";

const program = new Command();

program
  .name("agent-replay")
  .description("Local-first trace inspector for AI agents — record, list, and visualize traces in Studio")
  .version("0.2.0");

// ── dev ─────────────────────────────────────────────────────────────────────
program
  .command("dev")
  .description("Start the Studio dev server (requires the monorepo) and open the browser")
  .option("-p, --port <port>", "port to run on", "3000")
  .option("--no-open", "don't open browser automatically")
  .action(async (options: { port: string; open: boolean }) => {
    const { spawn } = await import("node:child_process");
    const port = options.port;
    console.log("Starting StepLens...");

    const child = spawn("pnpm", ["--filter", "@agent-replay/studio", "dev"], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: Object.assign({}, process.env, { PORT: port }),
      shell: true,
    });

    if (options.open !== false) {
      const { exec } = await import("node:child_process");
      setTimeout(() => {
        const p = process.platform;
        if (p === "win32") exec(`start http://localhost:${port}`);
        else if (p === "darwin") exec(`open http://localhost:${port}`);
        else exec(`xdg-open http://localhost:${port}`);
      }, 3000);
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

    try {
      const { execSync } = await import("node:child_process");
      const pnpmVer = execSync("pnpm --version", { encoding: "utf-8", timeout: 5000 }).trim();
      console.log(`  ✓ pnpm ${pnpmVer}`);
    } catch {
      console.log("  ✗ pnpm not found");
      allOk = false;
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
      console.log(`  - Studio not running at ${endpoint} (start it with \`agent-replay dev\`)`);
    }

    console.log("");
    if (allOk) console.log("All checks passed. Ready to use StepLens.");
    else { console.log("Some checks failed. Please fix the issues above."); process.exit(1); }
  });

// ── init ────────────────────────────────────────────────────────────────────
program
  .command("init")
  .description("Create a .env with the Agent Replay environment variables the SDK reads")
  .option("-e, --endpoint <url>", "Studio API endpoint", DEFAULT_ENDPOINT)
  .option("-f, --force", "overwrite an existing .env", false)
  .action(async (options: { endpoint: string; force: boolean }) => {
    const { writeFileSync, existsSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const envPath = resolve(process.cwd(), ".env");

    if (existsSync(envPath) && !options.force) {
      console.log(`.env already exists at ${envPath}`);
      console.log("Re-run with --force to overwrite, or add these lines manually:\n");
      console.log(`  AGENT_REPLAY_ENDPOINT=${options.endpoint}`);
      console.log(`  AGENT_REPLAY_ENABLED=true`);
      return;
    }

    const content = `# Agent Replay — read by @agent-replay/sdk's createClient()
# Studio serves both the UI and the ingest API at this URL.
AGENT_REPLAY_ENDPOINT=${options.endpoint}
# Set to false to disable recording without touching your code.
AGENT_REPLAY_ENABLED=true
`;
    writeFileSync(envPath, content, "utf-8");
    console.log(`Created ${envPath}`);
    console.log("\nNext steps:");
    console.log("  1. Start Studio:        agent-replay dev");
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
    const { resolve } = await import("node:path");
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
  .description("Run a command with Agent Replay env vars set (AGENT_REPLAY_ENDPOINT, AGENT_REPLAY_ENABLED). The command must use @agent-replay/sdk to record traces — this does not auto-instrument.")
  .option("-e, --endpoint <url>", "Studio API endpoint", DEFAULT_ENDPOINT)
  .allowUnknownOption()
  .allowExcessArguments()
  .action(async (options: { endpoint: string }) => {
    const rawArgs = process.argv;
    const dashIdx = rawArgs.indexOf("--");
    if (dashIdx === -1 || dashIdx >= rawArgs.length - 1) {
      console.error("Error: No command specified. Use: agent-replay record -- <command>");
      console.error("Example: agent-replay record -- node my-agent.js");
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

    // Studio must be running — we don't fake or auto-spawn it.
    let reachable = false;
    try {
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(1500) });
      reachable = res.ok || res.status === 304;
    } catch {
      reachable = false;
    }

    if (!reachable) {
      console.error(`Studio is not reachable at ${endpoint}.`);
      console.error("Start it first (in the repo: `pnpm dev`, or `agent-replay dev`), then re-run `agent-replay demo`.");
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

    // Flush all buffered events before exiting.
    await client.shutdown();

    console.log(`\nRecorded 3 traces. Open ${endpoint} to explore them.`);
    process.exit(0);
  });

// ── new ─────────────────────────────────────────────────────────────────────
const TEMPLATES = ["simple", "error", "openai", "ollama"] as const;
type TemplateName = (typeof TEMPLATES)[number];

program
  .command("new")
  .description(`Generate a runnable example file (${TEMPLATES.join(", ")})`)
  .argument("[template]", `template to generate (${TEMPLATES.join("|")})`, "simple")
  .option("-o, --out <path>", "output file path", "agent-replay-example.mjs")
  .option("-e, --endpoint <url>", "Studio API endpoint", DEFAULT_ENDPOINT)
  .option("-f, --force", "overwrite the output file if it exists", false)
  .action(async (template: string, options: { out: string; endpoint: string; force: boolean }) => {
    if (!TEMPLATES.includes(template as TemplateName)) {
      console.error(`Error: unknown template "${template}". Available: ${TEMPLATES.join(", ")}`);
      process.exit(1);
    }

    const { readFileSync, writeFileSync, existsSync } = await import("node:fs");
    const { resolve } = await import("node:path");
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
    if (template === "openai") {
      console.log("\n⚠  This example calls the real OpenAI API and may cost money.");
      console.log("   Set OPENAI_API_KEY and run `npm i openai` before running it.");
    }
    console.log("\nNext steps:");
    console.log("  1. Start Studio:    pnpm dev    (or: agent-replay dev)");
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
    const { readFileSync, existsSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const path = resolve(process.cwd(), file);

    if (!existsSync(path)) {
      console.error(`Error: file not found: ${path}`);
      process.exit(1);
    }

    let body: string;
    try {
      body = readFileSync(path, "utf-8");
      JSON.parse(body); // validate it's JSON before sending
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

// ── Parse ───────────────────────────────────────────────────────────────────
program.parse();
