#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { cp, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_RELEASE_COMPILE_TARGETS } from "./lib/release-build-plan";
import { hasBlockedBundleContent, hasBlockedBundlePath } from "./lib/release-bundle-filter";
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
  if (!bin) {
    throw new Error("Command must not be empty.");
  }
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
  if (!bin) {
    throw new Error("Command must not be empty.");
  }
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

const resolveBlockedLeakNeedles = (): string[] => {
  const needles = [REPO_ROOT.trim()].filter((value) => value.length > 1);
  const homeDirectory = os.homedir().trim();
  if (process.env.GITHUB_ACTIONS !== "true" && homeDirectory.length > 1) {
    needles.push(homeDirectory);
  }
  return [...new Set(needles)];
};

const resolveCompileWorkspaceParent = (): string =>
  process.platform === "darwin" || process.platform === "linux"
    ? "/tmp/trenchclaw-release-compile"
    : path.join(os.tmpdir(), "trenchclaw-release-compile");

const createCompileWorkspace = async (): Promise<string> => {
  const workspaceParent = resolveCompileWorkspaceParent();
  await mkdir(workspaceParent, { recursive: true });
  const workspaceRoot = await mkdtemp(path.join(workspaceParent, "repo-"));
  const trackedFiles = (await runCapture(["git", "ls-files", "-z"]))
    .split("\u0000")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  for (const relativePath of trackedFiles) {
    const source = path.join(REPO_ROOT, relativePath);
    const sourceStat = await stat(source).catch(() => null);
    if (!sourceStat?.isFile()) {
      continue;
    }

    const target = path.join(workspaceRoot, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target);
  }

  await run(["bun", "install", "--frozen-lockfile"], workspaceRoot);
  return workspaceRoot;
};

const verifyBundleVersion = async (bundleRoot: string, version: string): Promise<void> => {
  if (version.length === 0) {
    return;
  }

  const manifestPath = path.join(bundleRoot, "build-manifest.json");
  const manifestText = await Bun.file(manifestPath).text().catch(() => null);
  if (!manifestText) {
    throw new Error(`Release bundle manifest missing: ${manifestPath}`);
  }

  const manifest = JSON.parse(manifestText) as { version?: unknown };
  if (manifest.version !== version) {
    throw new Error(`Release bundle version mismatch: expected ${version}, found ${String(manifest.version ?? "unknown")}`);
  }
};

const verifyPackagedTarget = async (targetRoot: string, binaryName: string): Promise<void> => {
  const blockedNeedles = resolveBlockedLeakNeedles();
  const files = await walkFiles(targetRoot);
  const violations: string[] = [];

  for (const absolutePath of files) {
    const relativePath = path.relative(targetRoot, absolutePath).split(path.sep).join("/");
    const pathViolation = hasBlockedBundlePath(relativePath);
    if (pathViolation) {
      violations.push(pathViolation);
    }

    if (relativePath === binaryName) {
      continue;
    }

    try {
      const content = await readFile(absolutePath, "utf8");
      const contentViolation = hasBlockedBundleContent(relativePath, content, { blockedNeedles });
      if (contentViolation) {
        violations.push(contentViolation);
      }
    } catch {
      // Ignore non-text files.
    }
  }

  const binaryPath = path.join(targetRoot, binaryName);
  const binaryStrings = await runCapture(["strings", binaryPath], targetRoot);
  const binaryViolation = hasBlockedBundleContent(binaryName, binaryStrings, { blockedNeedles });
  if (binaryViolation) {
    violations.push(`compiled binary leaked host-specific content: ${binaryViolation}`);
  }

  if (violations.length > 0) {
    throw new Error(`Packaged artifact verification failed:\n- ${violations.join("\n- ")}`);
  }
};

const compileStandaloneBinary = async (
  compileWorkspaceRoot: string,
  targetRoot: string,
  compileTarget: string,
): Promise<string> => {
  const binaryName = "trenchclaw";
  const binaryPath = path.join(targetRoot, binaryName);
  await run([
    process.execPath,
    "build",
    "apps/runner/index.ts",
    "--compile",
    `--target=${compileTarget}`,
    `--outfile=${binaryPath}`,
  ], compileWorkspaceRoot);
  return binaryName;
};

const packageTarget = async (input: {
  version: string;
  commit: string;
  bundleRoot: string;
  outputRoot: string;
  compileTarget: string;
  compileWorkspaceRoot: string;
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
  const binaryName = await compileStandaloneBinary(input.compileWorkspaceRoot, targetRoot, input.compileTarget);

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
  await verifyPackagedTarget(targetRoot, binaryName);

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
  await verifyBundleVersion(args.bundleRoot, version);

  await rm(args.outputRoot, { recursive: true, force: true });
  await mkdir(args.outputRoot, { recursive: true });

  const metadata: ReleaseArtifactMetadata[] = [];
  let smokedArtifact = false;
  const compileWorkspaceRoot = await createCompileWorkspace();

  try {
    for (const compileTarget of args.targets) {
      const packaged = await packageTarget({
        version,
        commit,
        bundleRoot: args.bundleRoot,
        outputRoot: args.outputRoot,
        compileTarget,
        compileWorkspaceRoot,
      });
      const { artifactPath, ...artifactMetadata } = packaged;
      metadata.push(artifactMetadata);
      if (!skipSmokeTest && shouldSmokeCompileTargetOnHost(compileTarget) && !smokedArtifact) {
        console.log(`[package-app-release] smoke testing ${path.basename(artifactPath)} on ${hostTarget}`);
        await smokeTestArtifact(artifactPath);
        smokedArtifact = true;
      }
    }
  } finally {
    await rm(compileWorkspaceRoot, { recursive: true, force: true });
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
