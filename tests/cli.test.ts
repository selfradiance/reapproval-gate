import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const cliPath = path.join(rootDir, "src", "cli.ts");

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "reapproval-gate-test-"));
  tempDirs.push(dir);
  return dir;
}

async function runCli(args: string[]) {
  return new Promise<{ exitCode: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", cliPath, ...args], {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });
  });
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("CLI", () => {
  it("demo allow exits 0 and writes JSON", async () => {
    const dir = await tempDir();
    const out = path.join(dir, "allow-receipt.json");

    const result = await runCli([
      "evaluate",
      "--scope",
      "fixtures/scope.demo.json",
      "--action",
      "fixtures/action.allow.edit-file.json",
      "--json-out",
      out
    ]);

    expect(result.exitCode).toBe(0);
    const receipt = JSON.parse(await readFile(out, "utf8"));
    expect(receipt.decision).toBe("allow");
  });

  it("demo destructive exits 0 and writes JSON", async () => {
    const dir = await tempDir();
    const out = path.join(dir, "destructive-receipt.json");

    const result = await runCli([
      "evaluate",
      "--scope",
      "fixtures/scope.demo.json",
      "--action",
      "fixtures/action.reapproval.destructive.json",
      "--json-out",
      out
    ]);

    expect(result.exitCode).toBe(0);
    const receipt = JSON.parse(await readFile(out, "utf8"));
    expect(receipt.decision).toBe("reapproval_required");
  });

  it("malformed JSON exits 1", async () => {
    const dir = await tempDir();
    const malformed = path.join(dir, "malformed.json");
    await writeFile(malformed, "{", "utf8");

    const result = await runCli([
      "evaluate",
      "--scope",
      malformed,
      "--action",
      "fixtures/action.allow.edit-file.json"
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Invalid JSON");
  });

  it("amount without currency exits 1", async () => {
    const dir = await tempDir();
    const actionPath = path.join(dir, "action.json");
    await writeFile(
      actionPath,
      JSON.stringify({
        action_id: "action-pay-missing-currency",
        actor: "codex",
        action_type: "pay_invoice",
        resource: "invoice:INV-1001",
        operation: "pay",
        destructive: false,
        amount_cents: 100
      }),
      "utf8"
    );

    const result = await runCli([
      "evaluate",
      "--scope",
      "fixtures/scope.demo.json",
      "--action",
      actionPath
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Currency is required when amount_cents is declared");
  });

  it("unreadable file exits 1", async () => {
    const result = await runCli([
      "evaluate",
      "--scope",
      "fixtures/missing.json",
      "--action",
      "fixtures/action.allow.edit-file.json"
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Could not read scope file");
  });

  it("--json-out must not overwrite either input file", async () => {
    const scopeResult = await runCli([
      "evaluate",
      "--scope",
      "fixtures/scope.demo.json",
      "--action",
      "fixtures/action.allow.edit-file.json",
      "--json-out",
      "fixtures/scope.demo.json"
    ]);

    const actionResult = await runCli([
      "evaluate",
      "--scope",
      "fixtures/scope.demo.json",
      "--action",
      "fixtures/action.allow.edit-file.json",
      "--json-out",
      "fixtures/action.allow.edit-file.json"
    ]);

    expect(scopeResult.exitCode).toBe(1);
    expect(scopeResult.stderr).toContain("--json-out must not overwrite either input file");
    expect(actionResult.exitCode).toBe(1);
    expect(actionResult.stderr).toContain("--json-out must not overwrite either input file");
  });

  it("--json-out must not overwrite an input through an existing symlink", async () => {
    const dir = await tempDir();
    const symlinkPath = path.join(dir, "receipt.json");
    await symlink(path.join(rootDir, "fixtures", "scope.demo.json"), symlinkPath);

    const result = await runCli([
      "evaluate",
      "--scope",
      "fixtures/scope.demo.json",
      "--action",
      "fixtures/action.allow.edit-file.json",
      "--json-out",
      symlinkPath
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--json-out must not overwrite either input file");
    expect(result.stdout).not.toContain("Reapproval Gate Report");
  });

  it("missing --json-out value exits 1", async () => {
    const result = await runCli([
      "evaluate",
      "--scope",
      "fixtures/scope.demo.json",
      "--action",
      "fixtures/action.allow.edit-file.json",
      "--json-out"
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--json-out requires a value");
  });

  it("creates output directory if needed", async () => {
    const dir = await tempDir();
    const out = path.join(dir, "nested", "receipt.json");

    const result = await runCli([
      "evaluate",
      "--scope",
      "fixtures/scope.demo.json",
      "--action",
      "fixtures/action.allow.edit-file.json",
      "--json-out",
      out
    ]);

    expect(result.exitCode).toBe(0);
    const receipt = JSON.parse(await readFile(out, "utf8"));
    expect(receipt.action_id).toBe("action-edit-001");
  });

  it("generated JSON is stable pretty printed", async () => {
    const dir = await tempDir();
    const out = path.join(dir, "receipt.json");

    const result = await runCli([
      "evaluate",
      "--scope",
      "fixtures/scope.demo.json",
      "--action",
      "fixtures/action.allow.edit-file.json",
      "--json-out",
      out
    ]);

    expect(result.exitCode).toBe(0);
    const content = await readFile(out, "utf8");
    expect(content).toContain('\n  "decision": "allow",\n');
    expect(content.endsWith("\n")).toBe(true);
  });
});
