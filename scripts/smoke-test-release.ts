#!/usr/bin/env bun

import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const DEFAULT_TIMEOUT_MS = 30_000;

interface CliArgs {
  artifactRoot: string;
  timeoutMs: number;
}

const parseArgs = (argv: string[]): CliArgs => {
  let artifactRoot = "";
  let timeoutMs = DEFAULT_TIMEOUT_MS;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--artifact-root") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --artifact-root");
      }
      artifactRoot = path.resolve(value);
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

  if (!artifactRoot) {
    throw new Error("Missing required --artifact-root");
  }

  return { artifactRoot, timeoutMs };
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const binaryPath = path.join(args.artifactRoot, "trenchclaw");
  const binaryStat = await stat(binaryPath).catch(() => null);
  if (!binaryStat?.isFile()) {
    throw new Error(`Standalone binary not found: ${binaryPath}`);
  }

  const runtimeStateRoot = path.join(args.artifactRoot, ".smoke-state");
  await rm(runtimeStateRoot, { recursive: true, force: true });
  await mkdir(runtimeStateRoot, { recursive: true });

  const proc = Bun.spawn([binaryPath], {
    cwd: args.artifactRoot,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "ignore",
    env: {
      ...process.env,
      TRENCHCLAW_RELEASE_ROOT: args.artifactRoot,
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
      throw new Error(`Smoke test timed out after ${args.timeoutMs}ms for ${path.relative(REPO_ROOT, args.artifactRoot)}`);
    }),
  ]);

  if ((exitCode ?? 1) !== 0) {
    throw new Error(`Smoke test failed with exit code ${exitCode ?? 1}`);
  }

  console.log(`[smoke-test-release] OK -> ${args.artifactRoot}`);
};

await main();
