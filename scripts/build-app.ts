#!/usr/bin/env bun

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

const runCapture = async (command: string[], cwd = REPO_ROOT): Promise<string> => {
  const [bin, ...args] = command;
  const proc = Bun.spawn([bin, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "inherit",
    env: process.env,
  });
  const [code, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  if (code !== 0) {
    throw new Error(
      `Command failed (${code}): ${command.join(" ")}\n${stderr.trim()}`,
    );
  }
  return stdout;
};

const copyIntoOutput = async (relativeSource: string, relativeTarget = relativeSource): Promise<void> => {
  const source = path.join(REPO_ROOT, relativeSource);
  const target = path.join(OUTPUT_ROOT, relativeTarget);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { recursive: true });
};

const copyTrackedTreeIntoOutput = async (
  relativeSource: string,
  relativeTarget = relativeSource,
): Promise<void> => {
  const raw = await runCapture([
    "git",
    "-C",
    REPO_ROOT,
    "ls-files",
    "-z",
    "--",
    relativeSource,
  ]);
  const trackedFiles = raw.split("\u0000").filter((entry) => entry.length > 0);
  if (trackedFiles.length === 0) {
    throw new Error(`No tracked files found under ${relativeSource}`);
  }

  for (const trackedFile of trackedFiles) {
    const source = path.join(REPO_ROOT, trackedFile);
    const relativeWithinSource = path.relative(relativeSource, trackedFile);
    if (relativeWithinSource.startsWith("..")) {
      continue;
    }
    const target = path.join(OUTPUT_ROOT, relativeTarget, relativeWithinSource);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target);
  }
};

const readRootPackageVersion = async (): Promise<string> => {
  const packageJsonPath = path.join(REPO_ROOT, "package.json");
  const packageJsonRaw = await readFile(packageJsonPath, "utf8");
  const packageJson = JSON.parse(packageJsonRaw) as { version?: unknown };
  if (typeof packageJson.version === "string" && packageJson.version.trim().length > 0) {
    return packageJson.version.trim();
  }
  return "0.0.0";
};

const resolveBuildMetadata = async (): Promise<{
  version: string;
  commit: string;
}> => {
  const packageVersion = await readRootPackageVersion();
  const configuredVersion = process.env.TRENCHCLAW_BUILD_VERSION?.trim();
  const configuredCommit = process.env.TRENCHCLAW_BUILD_COMMIT?.trim();
  const gitShortSha = (await runCapture(["git", "-C", REPO_ROOT, "rev-parse", "--short", "HEAD"])).trim();

  return {
    version: configuredVersion && configuredVersion.length > 0 ? configuredVersion : `v${packageVersion}`,
    commit: configuredCommit && configuredCommit.length > 0 ? configuredCommit : gitShortSha,
  };
};

const main = async (): Promise<void> => {
  console.log("[build-app] cleaning old output");
  await rm(OUTPUT_ROOT, { recursive: true, force: true });

  const buildMetadata = await resolveBuildMetadata();
  process.env.TRENCHCLAW_BUILD_VERSION = buildMetadata.version;
  process.env.TRENCHCLAW_BUILD_COMMIT = buildMetadata.commit;
  console.log(
    `[build-app] gui build metadata version=${buildMetadata.version} commit=${buildMetadata.commit}`,
  );

  console.log("[build-app] building gui + runner + core runtime");
  await run(["bun", "run", "--cwd", "apps/frontends/gui", "build"]);
  await run(["bun", "run", "--cwd", "apps/runner", "build"]);
  await run(["bun", "run", "--cwd", "apps/trenchclaw", "build"]);

  console.log("[build-app] assembling distributable");
  await copyIntoOutput("apps/frontends/gui/dist");
  await copyIntoOutput("apps/runner/dist");
  await copyIntoOutput("apps/trenchclaw/package.json");
  await copyTrackedTreeIntoOutput("apps/trenchclaw/src");

  const shouldInstallRuntimeDependencies = process.env.TRENCHCLAW_BUNDLE_INSTALL_DEPS === "1";
  if (shouldInstallRuntimeDependencies) {
    console.log("[build-app] installing runtime production deps");
    await run(["bun", "install", "--production"], path.join(OUTPUT_ROOT, "apps/trenchclaw"));
  } else {
    console.log("[build-app] skipping runtime dependency install (set TRENCHCLAW_BUNDLE_INSTALL_DEPS=1 to include node_modules)");
  }

  const setupScript = `#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
echo "[trenchclaw-setup] installing runtime dependencies"
bun install --production --cwd apps/trenchclaw
echo "[trenchclaw-setup] done"
`;
  await writeFile(path.join(OUTPUT_ROOT, "setup.sh"), setupScript, "utf8");
  await run(["chmod", "+x", "setup.sh"], OUTPUT_ROOT);

  const launcher = `#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d "apps/trenchclaw/node_modules" ]; then
  echo "[trenchclaw] runtime dependencies are missing. Run ./setup.sh first." >&2
  exit 1
fi
exec bun apps/runner/dist/index.js "$@"
`;
  await writeFile(path.join(OUTPUT_ROOT, "start.sh"), launcher, "utf8");
  await run(["chmod", "+x", "start.sh"], OUTPUT_ROOT);

  const notes = `# TrenchClaw App Bundle

This bundle includes GUI assets, runner, and backend runtime source.

Not bundled intentionally:
- Bun runtime
- Any local user/runtime files (vault.json, keypairs, runtime db/events)

First run:
  ./setup.sh
  ./start.sh

Run:
  ./start.sh
`;
  await writeFile(path.join(OUTPUT_ROOT, "README.md"), notes, "utf8");

  console.log(`[build-app] done -> ${OUTPUT_ROOT}`);
};

await main();
