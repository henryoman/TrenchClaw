#!/usr/bin/env bun

import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const OUTPUT_ROOT = path.join(REPO_ROOT, "dist", "app");

const run = async (command: string[], cwd = REPO_ROOT): Promise<void> => {
  const [bin, ...args] = command;
  const proc = Bun.spawn([bin, ...args], {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env: process.env,
  });
  const code = (await proc.exited) ?? 1;
  if (code !== 0) {
    throw new Error(`Command failed (${code}): ${command.join(" ")}`);
  }
};

const copyIntoOutput = async (relativeSource: string, relativeTarget = relativeSource): Promise<void> => {
  const source = path.join(REPO_ROOT, relativeSource);
  const target = path.join(OUTPUT_ROOT, relativeTarget);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { recursive: true });
};

const main = async (): Promise<void> => {
  console.log("[build-app] cleaning old output");
  await rm(OUTPUT_ROOT, { recursive: true, force: true });

  console.log("[build-app] building gui + runner + core runtime");
  await run(["bun", "run", "--cwd", "apps/frontends/gui", "build"]);
  await run(["bun", "run", "--cwd", "apps/runner", "build"]);
  await run(["bun", "run", "--cwd", "apps/trenchclaw", "build"]);

  console.log("[build-app] assembling distributable");
  await copyIntoOutput("apps/frontends/gui/dist");
  await copyIntoOutput("apps/runner/dist");
  await copyIntoOutput("apps/trenchclaw/package.json");
  await copyIntoOutput("apps/trenchclaw/src");

  console.log("[build-app] installing runtime production deps");
  await run(["bun", "install", "--production"], path.join(OUTPUT_ROOT, "apps/trenchclaw"));

  const launcher = `#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
exec bun apps/runner/dist/index.js "$@"
`;
  await writeFile(path.join(OUTPUT_ROOT, "start.sh"), launcher, "utf8");
  await run(["chmod", "+x", "start.sh"], OUTPUT_ROOT);

  const notes = `# TrenchClaw App Bundle

This bundle includes GUI assets, runner, and backend runtime source.
Runtime dependencies are installed under apps/trenchclaw/node_modules.

Not bundled intentionally:
- Bun runtime
- Solana CLI binaries/tooling

Run:
  ./start.sh
`;
  await writeFile(path.join(OUTPUT_ROOT, "README.md"), notes, "utf8");

  console.log(`[build-app] done -> ${OUTPUT_ROOT}`);
};

await main();
