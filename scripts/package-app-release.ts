#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const DEFAULT_BUNDLE_ROOT = path.join(REPO_ROOT, "dist", "app");
const DEFAULT_RELEASE_ROOT = path.join(REPO_ROOT, "dist", "release");
const DEFAULT_TARGETS = ["bun-darwin-arm64", "bun-linux-x64", "bun-linux-arm64"] as const;

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
  artifactPath: string;
  checksumSha256: string;
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
    targets: targets.length > 0 ? targets : [...DEFAULT_TARGETS],
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

const normalizeTarget = (target: string): string => target.replace(/^bun-/, "");

const writeReleaseReadme = async (targetRoot: string, platformTarget: string): Promise<void> => {
  const markdown = `# TrenchClaw ${platformTarget}

This release is a standalone TrenchClaw build. Bun is already embedded in the executable.

Contents:
- \`trenchclaw\`: standalone executable
- \`gui/\`: prebuilt GUI assets
- \`core/\`: readonly runtime assets/config/templates

Run:
\`\`\`bash
./trenchclaw
\`\`\`

Optional overrides:
- \`TRENCHCLAW_RUNTIME_STATE_ROOT\`: choose where writable runtime data is stored
- \`TRENCHCLAW_PROFILE\`: choose the base runtime profile
`;
  await writeFile(path.join(targetRoot, "README.md"), markdown, "utf8");
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
}): Promise<ReleaseArtifactMetadata> => {
  const platformTarget = normalizeTarget(input.compileTarget);
  const targetDirName = `trenchclaw-${platformTarget}`;
  const targetRoot = path.join(input.outputRoot, targetDirName);

  await rm(targetRoot, { recursive: true, force: true });
  await mkdir(targetRoot, { recursive: true });
  await cp(path.join(input.bundleRoot, "gui"), path.join(targetRoot, "gui"), { recursive: true });
  await cp(path.join(input.bundleRoot, "core"), path.join(targetRoot, "core"), { recursive: true });
  const binaryName = await compileStandaloneBinary(targetRoot, input.compileTarget);
  await writeReleaseReadme(targetRoot, platformTarget);

  const artifactName = `trenchclaw-${input.version}-${platformTarget}.tar.gz`;
  const artifactPath = path.join(input.outputRoot, artifactName);
  await run(["tar", "-czf", artifactPath, targetDirName], input.outputRoot);
  const checksum = await sha256File(artifactPath);
  await writeFile(`${artifactPath}.sha256`, `${checksum}  ${artifactName}\n`, "utf8");

  const metadata: ReleaseArtifactMetadata = {
    version: input.version,
    commit: input.commit,
    createdAt: new Date().toISOString(),
    compileTarget: input.compileTarget,
    platformTarget,
    binaryName,
    artifactName,
    artifactPath: path.relative(REPO_ROOT, artifactPath),
    checksumSha256: checksum,
  };
  await writeFile(path.join(targetRoot, "release-metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  await writeFile(
    path.join(input.outputRoot, `release-metadata.${platformTarget}.json`),
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8",
  );

  console.log(`[package-app-release] created ${artifactPath}`);
  console.log(`[package-app-release] wrote ${artifactPath}.sha256`);
  return metadata;
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const version = await resolveVersion(args.version);
  const commit = await runCapture(["git", "rev-parse", "--short", "HEAD"]);

  await run([
    process.execPath,
    "run",
    "scripts/verify-app-bundle.ts",
    "--bundle-root",
    args.bundleRoot,
  ]);

  await mkdir(args.outputRoot, { recursive: true });

  const metadata = [];
  for (const compileTarget of args.targets) {
    metadata.push(
      await packageTarget({
        version,
        commit,
        bundleRoot: args.bundleRoot,
        outputRoot: args.outputRoot,
        compileTarget,
      }),
    );
  }

  await writeFile(path.join(args.outputRoot, "release-metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
};

await main();
