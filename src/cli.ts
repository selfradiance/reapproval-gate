#!/usr/bin/env node
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { inspect } from "node:util";
import { z } from "zod";
import { evaluateAction } from "./evaluator.js";
import { formatReport } from "./report.js";
import { approvedScopeSchema, proposedActionSchema } from "./schemas.js";

interface ParsedArgs {
  command: string;
  scopePath?: string;
  actionPath?: string;
  jsonOutPath?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const parsed: ParsedArgs = { command: command ?? "" };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    const next = rest[index + 1];

    if (arg === "--scope") {
      if (next === undefined || next.startsWith("--")) {
        throw new Error("--scope requires a value.");
      }
      parsed.scopePath = next;
      index += 1;
    } else if (arg === "--action") {
      if (next === undefined || next.startsWith("--")) {
        throw new Error("--action requires a value.");
      }
      parsed.actionPath = next;
      index += 1;
    } else if (arg === "--json-out") {
      if (next === undefined || next.startsWith("--")) {
        throw new Error("--json-out requires a value.");
      }
      parsed.jsonOutPath = next;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run evaluate -- --scope <approved-scope.json> --action <proposed-action.json> [--json-out <receipt.json>]"
  ].join("\n");
}

async function readJsonFile(filePath: string, label: string): Promise<unknown> {
  let content: string;

  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    throw new Error(`Could not read ${label} file at ${filePath}: ${inspect(error)}`);
  }

  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON in ${label} file at ${filePath}: ${inspect(error)}`);
  }
}

function formatZodError(label: string, error: z.ZodError): string {
  const issues = error.issues
    .map((issue) => {
      const location = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `- ${location}: ${issue.message}`;
    })
    .join("\n");

  return `${label} schema validation failed:\n${issues}`;
}

function sameResolvedPath(a: string, b: string): boolean {
  return path.resolve(a) === path.resolve(b);
}

interface FileIdentity {
  resolvedPath: string;
  realPath?: string;
  dev?: number;
  ino?: number;
}

async function getFileIdentity(filePath: string): Promise<FileIdentity> {
  const resolvedPath = path.resolve(filePath);

  try {
    const [realPath, stats] = await Promise.all([realpath(resolvedPath), stat(resolvedPath)]);

    return {
      resolvedPath,
      realPath,
      dev: stats.dev,
      ino: stats.ino
    };
  } catch {
    return { resolvedPath };
  }
}

function sameExistingFile(a: FileIdentity, b: FileIdentity): boolean {
  if (a.realPath !== undefined && b.realPath !== undefined && a.realPath === b.realPath) {
    return true;
  }

  return a.dev !== undefined && a.ino !== undefined && a.dev === b.dev && a.ino === b.ino;
}

async function assertSafeJsonOut(jsonOutPath: string, scopePath: string, actionPath: string): Promise<void> {
  if (sameResolvedPath(jsonOutPath, scopePath) || sameResolvedPath(jsonOutPath, actionPath)) {
    throw new Error("--json-out must not overwrite either input file.");
  }

  const [outputIdentity, scopeIdentity, actionIdentity] = await Promise.all([
    getFileIdentity(jsonOutPath),
    getFileIdentity(scopePath),
    getFileIdentity(actionPath)
  ]);

  if (sameExistingFile(outputIdentity, scopeIdentity) || sameExistingFile(outputIdentity, actionIdentity)) {
    throw new Error("--json-out must not overwrite either input file.");
  }
}

async function writeReceipt(jsonOutPath: string, receipt: unknown): Promise<void> {
  await mkdir(path.dirname(path.resolve(jsonOutPath)), { recursive: true });
  await writeFile(jsonOutPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
}

async function main(argv: string[]): Promise<number> {
  let args: ParsedArgs;

  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage());
    return 1;
  }

  if (args.command !== "evaluate" || !args.scopePath || !args.actionPath) {
    console.error(usage());
    return 1;
  }

  try {
    const scopeInput = await readJsonFile(args.scopePath, "scope");
    const actionInput = await readJsonFile(args.actionPath, "action");
    const scopeResult = approvedScopeSchema.safeParse(scopeInput);
    const actionResult = proposedActionSchema.safeParse(actionInput);

    if (!scopeResult.success) {
      throw new Error(formatZodError("Scope", scopeResult.error));
    }

    if (!actionResult.success) {
      throw new Error(formatZodError("Action", actionResult.error));
    }

    const receipt = evaluateAction(scopeResult.data, actionResult.data);

    if (args.jsonOutPath) {
      await assertSafeJsonOut(args.jsonOutPath, args.scopePath, args.actionPath);
      await writeReceipt(args.jsonOutPath, receipt);
    }

    console.log(formatReport(receipt));

    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

const exitCode = await main(process.argv.slice(2));
process.exitCode = exitCode;
