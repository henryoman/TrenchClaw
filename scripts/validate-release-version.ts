#!/usr/bin/env bun

import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseVersion } from "./versioning";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const ROOT_PACKAGE_JSON_PATH = path.join(REPO_ROOT, "package.json");

interface CliArgs {
  version: string | null;
  prerelease: boolean | null;
  githubOutputPath: string | null;
}

interface ReleaseValidationResult {
  packageVersion: string;
  tag: string;
  prerelease: boolean;
}

const parseArgs = (argv: string[]): CliArgs => {
  let version: string | null = null;
  let prerelease: boolean | null = null;
  let githubOutputPath: string | null = null;

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
      const normalized = value.trim().toLowerCase();
      if (normalized !== "true" && normalized !== "false") {
        throw new Error('Invalid --prerelease value. Expected "true" or "false".');
      }
      prerelease = normalized === "true";
      index += 1;
      continue;
    }
    if (arg === "--github-output") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --github-output");
      }
      githubOutputPath = value;
      index += 1;
    }
  }

  return { version, prerelease, githubOutputPath };
};

const runCapture = async (command: string[]): Promise<{ code: number; stdout: string }> => {
  const proc = Bun.spawn(command, {
    cwd: REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    env: process.env,
  });
  const [code, stdout] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
  ]);
  return {
    code: code ?? 1,
    stdout: stdout.trim(),
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

const validateRelease = async (args: CliArgs): Promise<ReleaseValidationResult> => {
  const packageVersion = await readRootVersion();
  parseVersion(packageVersion);

  const tag = args.version ?? `v${packageVersion.replace(/^v/, "")}`;
  parseVersion(tag);
  const prerelease = tag.includes("-beta.");

  if (args.prerelease !== null && args.prerelease !== prerelease) {
    throw new Error(`Prerelease flag mismatch: release tag ${tag} requires prerelease=${prerelease}`);
  }
  parseVersion(tag);

  if (await tagExists(tag)) {
    throw new Error(`Git tag already exists: ${tag}`);
  }

  return {
    packageVersion,
    tag,
    prerelease,
  };
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const result = await validateRelease(args);
  if (args.githubOutputPath) {
    await appendFile(
      args.githubOutputPath,
      `release_tag=${result.tag}\nprerelease=${result.prerelease}\npackage_version=${result.packageVersion}\n`,
      "utf8",
    );
  }
  console.log(JSON.stringify(result, null, 2));
};

await main();
