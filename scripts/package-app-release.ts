#!/usr/bin/env bun

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const DEFAULT_BUNDLE_ROOT = path.join(REPO_ROOT, "dist", "app");
const DEFAULT_RELEASE_ROOT = path.join(REPO_ROOT, "dist", "release");

interface CliArgs {
  version: string;
  bundleRoot: string;
  outputRoot: string;
}

const parseArgs = (argv: string[]): CliArgs => {
  let version = "";
  let bundleRoot = DEFAULT_BUNDLE_ROOT;
  let outputRoot = DEFAULT_RELEASE_ROOT;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--version") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --version");
      }
      version = value;
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
    }
  }

  return {
    version: version.trim(),
    bundleRoot,
    outputRoot,
  };
};

const run = async (command: string[], cwd = REPO_ROOT): Promise<void> => {
  const [bin, ...args] = command;
  const proc = Bun.spawn([bin, ...args], {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env: process.env,
  });
  const code = await proc.exited;
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
    throw new Error(`Command failed (${code}): ${command.join(" ")}\n${stderr.trim()}`);
  }
  return stdout.trim();
};

const resolveVersion = async (requestedVersion: string): Promise<string> => {
  if (requestedVersion.length > 0) {
    return requestedVersion;
  }
  const packageJson = Bun.file(path.join(REPO_ROOT, "package.json"));
  const packageJsonText = await packageJson.text();
  const parsed = JSON.parse(packageJsonText) as { version?: unknown };
  const packageVersion = typeof parsed.version === "string" && parsed.version.length > 0 ? parsed.version : "0.0.0";
  const shortSha = await runCapture(["git", "rev-parse", "--short", "HEAD"]);
  return `${packageVersion}-${shortSha}`;
};

const sha256File = async (filePath: string): Promise<string> => {
  const file = await readFile(filePath);
  return createHash("sha256").update(file).digest("hex");
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const version = await resolveVersion(args.version);

  await run([
    process.execPath,
    "run",
    "scripts/verify-app-bundle.ts",
    "--bundle-root",
    args.bundleRoot,
  ]);

  await mkdir(args.outputRoot, { recursive: true });

  const artifactName = `trenchclaw-app-${version}.tar.gz`;
  const artifactPath = path.join(args.outputRoot, artifactName);
  const bundleParent = path.dirname(args.bundleRoot);
  const bundleName = path.basename(args.bundleRoot);

  await run(["tar", "-czf", artifactPath, bundleName], bundleParent);
  const checksum = await sha256File(artifactPath);
  await writeFile(
    `${artifactPath}.sha256`,
    `${checksum}  ${artifactName}\n`,
    "utf8",
  );

  const shortSha = await runCapture(["git", "rev-parse", "--short", "HEAD"]);
  const metadata = {
    version,
    commit: shortSha,
    createdAt: new Date().toISOString(),
    artifactName,
    artifactPath: path.relative(REPO_ROOT, artifactPath),
    checksumSha256: checksum,
  };
  await writeFile(
    path.join(args.outputRoot, "release-metadata.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8",
  );

  console.log(`[package-app-release] created ${artifactPath}`);
  console.log(`[package-app-release] wrote ${artifactPath}.sha256`);
};

await main();
