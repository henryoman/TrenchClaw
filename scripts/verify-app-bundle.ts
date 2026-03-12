#!/usr/bin/env bun

import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

  const blockedExactPaths = new Set<string>([
    "core/src/ai/brain/protected/wallet-library.jsonl",
  ]);

  const requiredPaths = [
    "gui/index.html",
    "core/src/ai/config/vault.template.json",
    "core/src/ai/config/ai.template.json",
    "core/src/ai/brain/protected/keypairs/.keep",
  ];

  const violations: string[] = [];

  for (const relPath of relFiles) {
    const lower = relPath.toLowerCase();
    const fileName = path.posix.basename(relPath).toLowerCase();

    if (blockedExactPaths.has(relPath)) {
      violations.push(`blocked file present: ${relPath}`);
    }

    if (fileName.startsWith(".env") && fileName !== ".env.example") {
      violations.push(`environment file present in bundle: ${relPath}`);
    }

    if (relPath.includes("/node_modules/") || relPath.startsWith("node_modules/")) {
      violations.push(`node_modules should not be bundled: ${relPath}`);
    }

    if (relPath.startsWith("core/src/ai/brain/db/")) {
      violations.push(`runtime db/state file present in readonly bundle: ${relPath}`);
    }

    if (relPath.startsWith("core/src/ai/brain/protected/keypairs/")) {
      if (fileName !== ".keep" && fileName !== ".gitkeep") {
        violations.push(`unexpected keypair file in bundle: ${relPath}`);
      }
    }

    if (relPath.startsWith("core/src/ai/brain/protected/instance/") && fileName !== ".gitkeep") {
      violations.push(`unexpected instance-state file in bundle: ${relPath}`);
    }

    if (relPath.startsWith("core/src/ai/brain/protected/no-read/")) {
      violations.push(`unexpected no-read file in bundle: ${relPath}`);
    }

    if (fileName.endsWith(".sqlite") || fileName.endsWith(".jsonl") || fileName.endsWith(".log")) {
      violations.push(`runtime artifact present in bundle: ${relPath}`);
    }

    if (lower.endsWith(".pem") || lower.endsWith(".key") || lower.endsWith(".p12")) {
      violations.push(`blocked key/cert file in bundle: ${relPath}`);
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
