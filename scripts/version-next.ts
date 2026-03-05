#!/usr/bin/env bun

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  incrementVersion,
  parseVersion,
  type VersioningStrategy,
} from "./versioning";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const ROOT_PACKAGE_JSON_PATH = path.join(REPO_ROOT, "package.json");

interface CliArgs {
  strategy: VersioningStrategy;
  currentVersion: string | null;
  apply: boolean;
}

interface PackageJsonWithVersion extends Record<string, unknown> {
  version?: unknown;
}

const parseArgs = (argv: string[]): CliArgs => {
  let strategy: VersioningStrategy = "auto";
  let currentVersion: string | null = null;
  let apply = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--strategy") {
      const value = argv[index + 1];
      if (!value || (value !== "auto" && value !== "patch" && value !== "beta")) {
        throw new Error('Invalid --strategy value. Expected "auto", "patch", or "beta".');
      }
      strategy = value;
      index += 1;
      continue;
    }
    if (arg === "--current") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --current");
      }
      currentVersion = value;
      index += 1;
      continue;
    }
    if (arg === "--apply") {
      apply = true;
      continue;
    }
  }

  return { strategy, currentVersion, apply };
};

const readRootVersion = async (): Promise<string> => {
  const raw = await readFile(ROOT_PACKAGE_JSON_PATH, "utf8");
  const parsed = JSON.parse(raw) as PackageJsonWithVersion;
  return typeof parsed.version === "string" && parsed.version.length > 0
    ? parsed.version
    : "0.0.0";
};

const writeRootVersion = async (nextVersion: string): Promise<void> => {
  const raw = await readFile(ROOT_PACKAGE_JSON_PATH, "utf8");
  const parsed = JSON.parse(raw) as PackageJsonWithVersion;
  parsed.version = nextVersion;
  await writeFile(ROOT_PACKAGE_JSON_PATH, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
};

const toVersionTag = (value: string): string => `v${value}`;

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const currentVersion = args.currentVersion ?? (await readRootVersion());
  parseVersion(currentVersion);
  const nextVersion = incrementVersion(currentVersion, args.strategy);
  parseVersion(nextVersion);

  if (args.apply) {
    if (process.env.TRENCHCLAW_ALLOW_VERSION_WRITE !== "1") {
      throw new Error(
        'Version write is locked. Re-run with TRENCHCLAW_ALLOW_VERSION_WRITE=1 and "--apply" to update package.json.',
      );
    }
    await writeRootVersion(nextVersion);
  }

  const payload = {
    strategy: args.strategy,
    apply: args.apply,
    currentVersion,
    nextVersion,
    currentTag: toVersionTag(currentVersion.replace(/^v/, "")),
    nextTag: toVersionTag(nextVersion),
  };

  console.log(JSON.stringify(payload, null, 2));
};

await main();
