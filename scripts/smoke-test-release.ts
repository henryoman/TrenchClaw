#!/usr/bin/env bun

import { mkdtemp, mkdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const DEFAULT_TIMEOUT_MS = 30_000;

interface CliArgs {
  artifactPath: string;
  timeoutMs: number;
}

const parseArgs = (argv: string[]): CliArgs => {
  let artifactPath = "";
  let timeoutMs = DEFAULT_TIMEOUT_MS;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--artifact-path") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --artifact-path");
      }
      artifactPath = path.resolve(value);
      i += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --timeout-ms");
      }
      timeoutMs = Math.max(1, Math.trunc(Number(value)));
      i += 1;
    }
  }

  if (!artifactPath) {
    throw new Error("Missing required --artifact-path");
  }

  return { artifactPath, timeoutMs };
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const extractRoot = await mkdtemp(path.join(os.tmpdir(), "trenchclaw-smoke-"));
  const artifactName = path.basename(args.artifactPath);
  const extractCode = await Bun.spawn(["tar", "-xzf", args.artifactPath, "-C", extractRoot], {
    cwd: REPO_ROOT,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "ignore",
    env: process.env,
  }).exited;
  if ((extractCode ?? 1) !== 0) {
    throw new Error(`Failed to extract release artifact: ${artifactName}`);
  }

  const binaryPath = path.join(extractRoot, "trenchclaw");
  const binaryStat = await stat(binaryPath).catch(() => null);
  if (!binaryStat?.isFile()) {
    throw new Error(`Standalone binary not found: ${binaryPath}`);
  }

  const runtimeStateRoot = path.join(extractRoot, ".smoke-state");
  await rm(runtimeStateRoot, { recursive: true, force: true });
  await mkdir(runtimeStateRoot, { recursive: true });

  const proc = Bun.spawn([binaryPath], {
    cwd: extractRoot,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "ignore",
    env: {
      ...process.env,
      TRENCHCLAW_RELEASE_ROOT: extractRoot,
      TRENCHCLAW_RUNTIME_STATE_ROOT: runtimeStateRoot,
      TRENCHCLAW_RUNNER_SMOKE_TEST: "1",
      TRENCHCLAW_RUNNER_PROMPT_GUI_LAUNCH: "0",
      TRENCHCLAW_RUNNER_AUTO_OPEN_GUI: "0",
      TRENCHCLAW_BOOT_REFRESH_CONTEXT: "0",
      TRENCHCLAW_BOOT_REFRESH_KNOWLEDGE: "0",
    },
  });

  const exitCode = await Promise.race([
    proc.exited,
    Bun.sleep(args.timeoutMs).then(() => {
      proc.kill("SIGKILL");
      throw new Error(`Smoke test timed out after ${args.timeoutMs}ms for ${path.relative(REPO_ROOT, args.artifactPath)}`);
    }),
  ]);

  if ((exitCode ?? 1) !== 0) {
    throw new Error(`Smoke test failed with exit code ${exitCode ?? 1}`);
  }

  const requiredGeneratedFiles = [
    path.join(runtimeStateRoot, "runtime", "ai.json"),
    path.join(runtimeStateRoot, "runtime", "settings.json"),
    path.join(runtimeStateRoot, "runtime", "vault.template.json"),
    path.join(runtimeStateRoot, "protected", "keypairs", ".keep"),
  ];
  for (const filePath of requiredGeneratedFiles) {
    const fileStat = await stat(filePath).catch(() => null);
    if (!fileStat?.isFile()) {
      throw new Error(`Smoke test missing generated first-run file: ${filePath}`);
    }
  }

  const aiSettings = JSON.parse(await readFile(path.join(runtimeStateRoot, "runtime", "ai.json"), "utf8")) as {
    provider?: unknown;
    model?: unknown;
  };
  if (typeof aiSettings.provider !== "string" || typeof aiSettings.model !== "string") {
    throw new Error("Smoke test generated ai.json without the expected default AI settings shape");
  }

  const runtimeSettingsRaw = await readFile(path.join(runtimeStateRoot, "runtime", "settings.json"), "utf8");
  if (runtimeSettingsRaw.trim() !== "{}") {
    throw new Error("Smoke test expected runtime/settings.json to be generated as an empty object");
  }

  await rm(extractRoot, { recursive: true, force: true });
  console.log(`[smoke-test-release] OK -> ${artifactName}`);
};

await main();
