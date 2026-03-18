#!/usr/bin/env bun

import path from "node:path";
import { fileURLToPath } from "node:url";
import { RELEASE_BUILD_COMMANDS } from "./lib/release-build-plan";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const DEFAULT_BUNDLE_ROOT = path.join(REPO_ROOT, "dist", "app");
const DEFAULT_RELEASE_ROOT = path.join(REPO_ROOT, "dist", "release");

interface CliArgs {
  version: string;
  bundleRoot: string;
  outputRoot: string;
  targets: string[];
  runChecks: boolean;
  skipPackage: boolean;
  skipSmoke: boolean;
}

const parseArgs = (argv: string[]): CliArgs => {
  let version = "";
  let bundleRoot = DEFAULT_BUNDLE_ROOT;
  let outputRoot = DEFAULT_RELEASE_ROOT;
  const targets: string[] = [];
  let runChecks = false;
  let skipPackage = false;
  let skipSmoke = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--version") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --version");
      }
      version = value.trim();
      i += 1;
      continue;
    }
    if (arg === "--bundle-root") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --bundle-root");
      }
      bundleRoot = path.resolve(value);
      i += 1;
      continue;
    }
    if (arg === "--output-root") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --output-root");
      }
      outputRoot = path.resolve(value);
      i += 1;
      continue;
    }
    if (arg === "--target") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --target");
      }
      targets.push(value.trim());
      i += 1;
      continue;
    }
    if (arg === "--run-checks") {
      runChecks = true;
      continue;
    }
    if (arg === "--skip-package") {
      skipPackage = true;
      continue;
    }
    if (arg === "--skip-smoke") {
      skipSmoke = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    version,
    bundleRoot,
    outputRoot,
    targets,
    runChecks,
    skipPackage,
    skipSmoke,
  };
};

const run = async (command: string[], env?: NodeJS.ProcessEnv): Promise<void> => {
  const [bin, ...args] = command;
  if (!bin) {
    throw new Error("Cannot run an empty command");
  }

  console.log(`[release-build] $ ${command.join(" ")}`);
  const proc = Bun.spawn([bin, ...args], {
    cwd: REPO_ROOT,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env: env ?? process.env,
  });
  const exitCode = await proc.exited;
  if ((exitCode ?? 1) !== 0) {
    throw new Error(`Command failed (${exitCode ?? 1}): ${command.join(" ")}`);
  }
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));

  if (args.runChecks) {
    await run(["bun", "run", "--cwd", "apps/trenchclaw", "typecheck"]);
    await run(["bun", "run", "--cwd", "apps/runner", "typecheck"]);
  }

  await run(["bun", "run", "scripts/build-app.ts", "--output-root", args.bundleRoot]);
  await run(["bun", "run", "scripts/verify-app-bundle.ts", "--bundle-root", args.bundleRoot]);

  if (args.skipPackage) {
    console.log("[release-build] bundle ready; packaging skipped");
    return;
  }

  const packageCommand = [
    "bun",
    "run",
    "scripts/package-app-release.ts",
    "--bundle-root",
    args.bundleRoot,
    "--output-root",
    args.outputRoot,
  ];

  if (args.version.length > 0) {
    packageCommand.push("--version", args.version);
  }
  for (const target of args.targets) {
    packageCommand.push("--target", target);
  }

  await run(packageCommand, {
    ...process.env,
    ...(args.skipSmoke ? { TRENCHCLAW_RELEASE_SKIP_SMOKE: "1" } : {}),
  });

  console.log(`[release-build] complete -> bundle=${args.bundleRoot} release=${args.outputRoot}`);
  console.log(`[release-build] commands: ${RELEASE_BUILD_COMMANDS.bundle} -> ${RELEASE_BUILD_COMMANDS.verify} -> ${RELEASE_BUILD_COMMANDS.package}`);
};

await main();
