import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = fileURLToPath(new URL("../dist/index.js", import.meta.url));

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Run the built CLI with args, returning exit code and captured output. */
function runCli(
  args: string[],
  opts: { cwd?: string; timeout?: number } = {},
): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLI, ...args],
      // Generous timeout: these spawn real subprocesses and run alongside the
      // rest of the monorepo's suites under `turbo run test`.
      { cwd: opts.cwd, timeout: opts.timeout ?? 45000 },
      (error, stdout, stderr) => {
        const code =
          error && typeof (error as { code?: unknown }).code === "number"
            ? ((error as { code: number }).code)
            : error
              ? 1
              : 0;
        resolve({ code, stdout, stderr });
      },
    );
  });
}

describe("agent-replay CLI", () => {
  it("--help lists all commands", async () => {
    const { code, stdout } = await runCli(["--help"]);
    expect(code).toBe(0);
    for (const cmd of ["dev", "doctor", "init", "export", "record", "demo"]) {
      expect(stdout).toContain(cmd);
    }
  });

  it("--version prints 0.4.0", async () => {
    const { code, stdout } = await runCli(["--version"]);
    expect(code).toBe(0);
    expect(stdout.trim()).toBe("0.4.0");
  });

  it("doctor runs and reports a system check", async () => {
    const { stdout } = await runCli(["doctor"]);
    expect(stdout).toContain("System Check");
    expect(stdout).toContain("Node.js");
  });

  it("record without a command errors with guidance", async () => {
    const { code, stderr } = await runCli(["record"]);
    expect(code).toBe(1);
    expect(stderr).toContain("No command specified");
    expect(stderr).toContain("record -- <command>");
  });

  it("record runs the command after -- with replay env vars", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-replay-record-"));
    try {
      // Write a probe script to avoid cross-platform shell quoting issues.
      const probePath = join(dir, "probe.cjs");
      writeFileSync(
        probePath,
        "console.log('ENDPOINT=' + process.env.AGENT_REPLAY_ENDPOINT);\n" +
          "console.log('ENABLED=' + process.env.AGENT_REPLAY_ENABLED);\n",
      );
      // Use the PATH `node` (not process.execPath) — `record` spawns with
      // shell:true, which splits paths containing spaces (e.g. "Program Files").
      const { stdout } = await runCli([
        "record",
        "-e",
        "http://localhost:3000",
        "--",
        "node",
        probePath,
      ]);
      expect(stdout).toContain("ENDPOINT=http://localhost:3000");
      expect(stdout).toContain("ENABLED=true");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("demo fails fast when Studio is unreachable (no fake data)", async () => {
    const { code, stderr } = await runCli([
      "demo",
      "-e",
      "http://localhost:59999",
    ]);
    expect(code).toBe(1);
    expect(stderr).toContain("not reachable");
  });

  it("init writes a .env the SDK can read", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-replay-init-"));
    try {
      const { code, stdout } = await runCli(
        ["init", "-e", "http://localhost:3000"],
        { cwd: dir },
      );
      expect(code).toBe(0);
      expect(stdout).toContain("Created");
      const envPath = join(dir, ".env");
      expect(existsSync(envPath)).toBe(true);
      const env = readFileSync(envPath, "utf-8");
      expect(env).toContain("AGENT_REPLAY_ENDPOINT=http://localhost:3000");
      expect(env).toContain("AGENT_REPLAY_ENABLED=true");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects unknown commands", async () => {
    const { code, stderr } = await runCli(["bogus-command"]);
    expect(code).not.toBe(0);
    expect(stderr.toLowerCase()).toContain("unknown command");
  });
});

describe("agent-replay new", () => {
  it("creates the default example file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-replay-new-"));
    try {
      const { code, stdout } = await runCli(["new", "simple"], { cwd: dir });
      expect(code).toBe(0);
      expect(stdout).toContain("Created");
      const file = join(dir, "steplens-example.mjs");
      expect(existsSync(file)).toBe(true);
      const content = readFileSync(file, "utf-8");
      expect(content).toContain('@agent-replay/sdk/simple');
      expect(content).toContain("node steplens-example.mjs");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not overwrite without --force", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-replay-new-"));
    try {
      await runCli(["new", "simple"], { cwd: dir });
      const again = await runCli(["new", "simple"], { cwd: dir });
      expect(again.code).toBe(1);
      expect(again.stderr).toContain("already exists");

      const forced = await runCli(["new", "simple", "--force"], { cwd: dir });
      expect(forced.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects an unknown template", async () => {
    const { code, stderr } = await runCli(["new", "nope"]);
    expect(code).toBe(1);
    expect(stderr).toContain("unknown template");
  });

  it("generates runnable templates with valid commands and the endpoint", async () => {
    for (const template of [
      "simple",
      "error",
      "openai",
      "ollama",
      "vercel-ai",
      "anthropic",
      "google",
      "langchain",
    ]) {
      const dir = mkdtempSync(join(tmpdir(), `agent-replay-${template}-`));
      try {
        const { code } = await runCli(
          ["new", template, "-e", "http://localhost:3001", "--out", "ex.mjs"],
          { cwd: dir },
        );
        expect(code).toBe(0);
        const content = readFileSync(join(dir, "ex.mjs"), "utf-8");
        expect(content).toContain("http://localhost:3001");
        expect(content).toContain("node ex.mjs");
        expect(content).toContain("npx steplens dev");
        expect(content).toContain("@agent-replay/sdk/simple");
        if (template === "openai") {
          expect(content).toContain("wrapOpenAI");
          expect(content).toContain("OPENAI_API_KEY");
        }
        if (template === "ollama") {
          expect(content).toContain("ollama:");
          expect(content).toContain("11434");
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  // Each integration template: required package, expected API key, correct
  // SDK import, and a clear real-cost warning in the generated file.
  const INTEGRATION_TEMPLATES: Array<{
    template: string;
    pkg: string;
    env: string;
    sdkImport: string;
    wrapper: string;
  }> = [
    {
      template: "vercel-ai",
      pkg: "npm i ai @ai-sdk/openai",
      env: "OPENAI_API_KEY",
      sdkImport: "@agent-replay/sdk/integrations/vercel-ai",
      wrapper: "wrapAISDK",
    },
    {
      template: "anthropic",
      pkg: "npm i @anthropic-ai/sdk",
      env: "ANTHROPIC_API_KEY",
      sdkImport: "@agent-replay/sdk/integrations/anthropic",
      wrapper: "wrapAnthropic",
    },
    {
      template: "google",
      pkg: "npm i @google/genai",
      env: "GEMINI_API_KEY",
      sdkImport: "@agent-replay/sdk/integrations/google",
      wrapper: "wrapGoogleGenAI",
    },
    {
      template: "langchain",
      pkg: "npm i @langchain/openai @langchain/core",
      env: "OPENAI_API_KEY",
      sdkImport: "@agent-replay/sdk/integrations/langchain",
      wrapper: "createLangChainCallbackHandler",
    },
  ];

  for (const { template, pkg, env, sdkImport, wrapper } of INTEGRATION_TEMPLATES) {
    it(`${template} template documents its package, API key, and real cost`, async () => {
      const dir = mkdtempSync(join(tmpdir(), `agent-replay-${template}-`));
      try {
        const { code, stdout } = await runCli(["new", template, "--out", "ex.mjs"], {
          cwd: dir,
        });
        expect(code).toBe(0);
        // The command itself warns about real API cost.
        expect(stdout).toContain("may cost money");
        expect(stdout).toContain(env);

        const content = readFileSync(join(dir, "ex.mjs"), "utf-8");
        expect(content).toContain(pkg);
        expect(content).toContain(env);
        expect(content).toContain(sdkImport);
        expect(content).toContain(wrapper);
        expect(content).toContain("may cost money");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }

  it("does not overwrite new integration templates without --force", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-replay-new-int-"));
    try {
      await runCli(["new", "anthropic"], { cwd: dir });
      const again = await runCli(["new", "google"], { cwd: dir });
      expect(again.code).toBe(1);
      expect(again.stderr).toContain("already exists");

      const forced = await runCli(["new", "google", "--force"], { cwd: dir });
      expect(forced.code).toBe(0);
      const content = readFileSync(join(dir, "steplens-example.mjs"), "utf-8");
      expect(content).toContain("wrapGoogleGenAI");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("agent-replay import", () => {
  it("errors when the file is missing", async () => {
    const { code, stderr } = await runCli(["import", "/no/such/file.json"]);
    expect(code).toBe(1);
    expect(stderr).toContain("file not found");
  });

  it("errors on invalid JSON", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-replay-import-"));
    try {
      const bad = join(dir, "bad.json");
      writeFileSync(bad, "{ not valid json");
      const { code, stderr } = await runCli(["import", bad]);
      expect(code).toBe(1);
      expect(stderr).toContain("invalid JSON");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("errors clearly when Studio is unreachable", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-replay-import-"));
    try {
      const file = join(dir, "trace.json");
      writeFileSync(
        file,
        JSON.stringify({
          version: "1.0.0",
          trace: { id: "x", name: "n", status: "success", startedAt: 1 },
        }),
      );
      const { code, stderr } = await runCli([
        "import",
        file,
        "-e",
        "http://localhost:59999",
      ]);
      expect(code).toBe(1);
      expect(stderr).toContain("could not reach Studio");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
