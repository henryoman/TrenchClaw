#!/usr/bin/env bun

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseVersion } from "./versioning";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const ROOT_PACKAGE_JSON_PATH = path.join(REPO_ROOT, "package.json");

interface CliArgs {
  version: string;
  prerelease: boolean;
}

const parseArgs = (argv: string[]): CliArgs => {
  let version = "";
  let prereleaseValue = "";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--version") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --version");
      }
      version = value.trim();
      index += 1;
      continue;
    }
    if (arg === "--prerelease") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --prerelease");
      }
      prereleaseValue = value.trim().toLowerCase();
      index += 1;
    }
  }

  if (!version) {
    throw new Error("Missing required --version");
  }
  if (prereleaseValue !== "true" && prereleaseValue !== "false") {
    throw new Error('Missing or invalid --prerelease value. Expected "true" or "false".');
  }

  return {
    version,
    prerelease: prereleaseValue === "true",
  };
};

const runCapture = async (command: string[]): Promise<{ code: number; stdout: string; stderr: string }> => {
  const proc = Bun.spawn(command, {
    cwd: REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    env: process.env,
  });
  const [code, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return {
    code: code ?? 1,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
};

const readRootVersion = async (): Promise<string> => {
  const raw = await readFile(ROOT_PACKAGE_JSON_PATH, "utf8");
  const parsed = JSON.parse(raw) as { version?: unknown };
  if (typeof parsed.version !== "string" || parsed.version.trim().length === 0) {
    throw new Error("package.json is missing a valid version string");
  }
  return parsed.version.trim();
};

const tagExists = async (tagName: string): Promise<boolean> => {
  const local = await runCapture(["git", "rev-parse", "-q", "--verify", `refs/tags/${tagName}`]);
  if (local.code === 0) {
    return true;
  }

  const remote = await runCapture(["git", "ls-remote", "--tags", "origin", tagName]);
  return remote.code === 0 && remote.stdout.length > 0;
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const packageVersion = await readRootVersion();
  parseVersion(packageVersion);
  parseVersion(args.version);

  const expectedTag = `v${packageVersion.replace(/^v/, "")}`;
  if (args.version !== expectedTag) {
    throw new Error(`Release input ${args.version} does not match package.json version ${expectedTag}`);
  }

  const packageIsPrerelease = packageVersion.includes("-beta.");
  if (packageIsPrerelease !== args.prerelease) {
    throw new Error(
      `Prerelease flag mismatch: package.json version ${packageVersion} requires prerelease=${packageIsPrerelease}`,
    );
  }

  if (await tagExists(args.version)) {
    throw new Error(`Git tag already exists: ${args.version}`);
  }

  console.log(
    JSON.stringify(
      {
        packageVersion,
        tag: expectedTag,
        prerelease: args.prerelease,
      },
      null,
      2,
    ),
  );
};

await main();
