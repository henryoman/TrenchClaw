#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_RELEASE_COMPILE_TARGETS } from "./lib/release-build-plan";
import { normalizeTarget, resolveHostPlatformTarget, shouldSmokeCompileTargetOnHost } from "./lib/release-platform";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const DEFAULT_BUNDLE_ROOT = path.join(REPO_ROOT, "dist", "app");
const DEFAULT_RELEASE_ROOT = path.join(REPO_ROOT, "dist", "release");
interface CliArgs {
  version: string;
  bundleRoot: string;
  outputRoot: string;
  targets: string[];
}

interface ReleaseArtifactMetadata {
  version: string;
  commit: string;
  createdAt: string;
  compileTarget: string;
  platformTarget: string;
  binaryName: string;
  artifactName: string;
}

const parseArgs = (argv: string[]): CliArgs => {
  let version = "";
  let bundleRoot = DEFAULT_BUNDLE_ROOT;
  let outputRoot = DEFAULT_RELEASE_ROOT;
  const targets: string[] = [];

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
      continue;
    }
    if (arg === "--target") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --target");
      }
      targets.push(value.trim());
      i += 1;
    }
  }

  return {
    version: version.trim(),
    bundleRoot,
    outputRoot,
    targets: targets.length > 0 ? targets : [...DEFAULT_RELEASE_COMPILE_TARGETS],
  };
};

const run = async (command: string[], cwd = REPO_ROOT): Promise<void> => {
  const [bin, ...args] = command;
  const proc = Bun.spawn([bin, ...args], {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env: {
      ...process.env,
      COPYFILE_DISABLE: "1",
    },
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

const compileStandaloneBinary = async (targetRoot: string, compileTarget: string): Promise<string> => {
  const binaryName = "trenchclaw";
  const binaryPath = path.join(targetRoot, binaryName);
  await run([
    process.execPath,
    "build",
    "apps/runner/index.ts",
    "--compile",
    `--target=${compileTarget}`,
    `--outfile=${binaryPath}`,
  ]);
  return binaryName;
};

const packageTarget = async (input: {
  version: string;
  commit: string;
  bundleRoot: string;
  outputRoot: string;
  compileTarget: string;
}): Promise<ReleaseArtifactMetadata & { artifactPath: string }> => {
  const platformTarget = normalizeTarget(input.compileTarget);
  const targetRoot = path.join(input.outputRoot, `.staging-${platformTarget}`);
  const artifactName = `trenchclaw-${input.version}-${platformTarget}.tar.gz`;
  const artifactPath = path.join(input.outputRoot, artifactName);
  const metadataPath = path.join(input.outputRoot, `trenchclaw-${input.version}-${platformTarget}.release-metadata.json`);

  await rm(targetRoot, { recursive: true, force: true });
  await mkdir(targetRoot, { recursive: true });
  await cp(path.join(input.bundleRoot, "gui"), path.join(targetRoot, "gui"), { recursive: true });
  await cp(path.join(input.bundleRoot, "core"), path.join(targetRoot, "core"), { recursive: true });
  const binaryName = await compileStandaloneBinary(targetRoot, input.compileTarget);

  const metadata: ReleaseArtifactMetadata = {
    version: input.version,
    commit: input.commit,
    createdAt: new Date().toISOString(),
    compileTarget: input.compileTarget,
    platformTarget,
    binaryName,
    artifactName,
  };
  await writeFile(path.join(targetRoot, "release-metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  await run(["tar", "-czf", artifactPath, "-C", targetRoot, "trenchclaw", "gui", "core", "release-metadata.json"]);
  const checksum = await sha256File(artifactPath);
  await writeFile(`${artifactPath}.sha256`, `${checksum}  ${artifactName}\n`, "utf8");
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  await rm(targetRoot, { recursive: true, force: true });

  console.log(`[package-app-release] created ${artifactPath}`);
  console.log(`[package-app-release] wrote ${artifactPath}.sha256`);
  console.log(`[package-app-release] wrote ${metadataPath}`);
  return {
    ...metadata,
    artifactPath,
  };
};

const smokeTestArtifact = async (artifactPath: string): Promise<void> => {
  await run([process.execPath, "run", "scripts/smoke-test-release.ts", "--artifact-path", artifactPath]);
};

const shouldSkipSmokeTest = (): boolean => {
  const configured = process.env.TRENCHCLAW_RELEASE_SKIP_SMOKE?.trim().toLowerCase();
  return configured === "1" || configured === "true";
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const version = await resolveVersion(args.version);
  const commit = await runCapture(["git", "rev-parse", "--short", "HEAD"]);
  const hostTarget = resolveHostPlatformTarget();
  const skipSmokeTest = shouldSkipSmokeTest();

  await run([
    process.execPath,
    "run",
    "scripts/verify-app-bundle.ts",
    "--bundle-root",
    args.bundleRoot,
  ]);

  await rm(args.outputRoot, { recursive: true, force: true });
  await mkdir(args.outputRoot, { recursive: true });

  const metadata: ReleaseArtifactMetadata[] = [];
  let smokedArtifact = false;
  for (const compileTarget of args.targets) {
    const packaged = await packageTarget({
      version,
      commit,
      bundleRoot: args.bundleRoot,
      outputRoot: args.outputRoot,
      compileTarget,
    });
    const { artifactPath, ...artifactMetadata } = packaged;
    metadata.push(artifactMetadata);
    if (!skipSmokeTest && shouldSmokeCompileTargetOnHost(compileTarget) && !smokedArtifact) {
      console.log(`[package-app-release] smoke testing ${path.basename(artifactPath)} on ${hostTarget}`);
      await smokeTestArtifact(artifactPath);
      smokedArtifact = true;
    }
  }
  if (!smokedArtifact) {
    if (skipSmokeTest) {
      console.log("[package-app-release] skipped smoke test: disabled by TRENCHCLAW_RELEASE_SKIP_SMOKE");
    } else if (hostTarget) {
      console.log(`[package-app-release] skipped smoke test: no artifact for host target ${hostTarget}`);
    } else {
      console.log(`[package-app-release] skipped smoke test: unsupported host ${process.platform}-${process.arch}`);
    }
  }
  await writeFile(path.join(args.outputRoot, "release-metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
};

await main();
