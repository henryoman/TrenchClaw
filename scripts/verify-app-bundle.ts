#!/usr/bin/env bun

import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasBlockedBundlePath } from "./lib/release-bundle-filter";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const DEFAULT_BUNDLE_ROOT = path.join(REPO_ROOT, "dist", "app");

interface CliArgs {
  bundleRoot: string;
}

const parseArgs = (argv: string[]): CliArgs => {
  let bundleRoot = DEFAULT_BUNDLE_ROOT;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--bundle-root") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --bundle-root");
      }
      bundleRoot = path.resolve(value);
      i += 1;
    }
  }
  return { bundleRoot };
};

const toRelativeUnixPath = (root: string, absoluteFilePath: string): string =>
  path.relative(root, absoluteFilePath).split(path.sep).join("/");

const walkFiles = async (root: string): Promise<string[]> => {
  const pending = [root];
  const files: string[] = [];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      continue;
    }
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(absolutePath);
        continue;
      }
      if (entry.isFile()) {
        files.push(absolutePath);
      }
    }
  }

  return files;
};

const run = async (): Promise<void> => {
  const { bundleRoot } = parseArgs(process.argv.slice(2));

  const bundleStat = await stat(bundleRoot).catch(() => null);
  if (!bundleStat || !bundleStat.isDirectory()) {
    throw new Error(`Bundle root not found: ${bundleRoot}`);
  }

  const files = await walkFiles(bundleRoot);
  const relFiles = files.map((filePath) => toRelativeUnixPath(bundleRoot, filePath));

  const requiredPaths = [
    "gui/index.html",
    "core/src/ai/config/vault.template.json",
    "core/src/ai/config/ai.template.json",
    "core/src/ai/brain/protected/keypairs/.keep",
    "core/src/runtime/gui-transport/router.ts",
  ];

  const violations: string[] = [];

  for (const relPath of relFiles) {
    const violation = hasBlockedBundlePath(relPath);
    if (violation) {
      violations.push(violation);
    }
  }

  for (const requiredPath of requiredPaths) {
    if (!relFiles.includes(requiredPath)) {
      violations.push(`required placeholder/template missing: ${requiredPath}`);
    }
  }

  if (violations.length > 0) {
    throw new Error(`Bundle verification failed:\n- ${violations.join("\n- ")}`);
  }

  console.log(`[verify-app-bundle] OK (${relFiles.length} files) at ${bundleRoot}`);
};

await run();
