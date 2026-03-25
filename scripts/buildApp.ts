#!/usr/bin/env bun

import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RELEASE_BUILD_COMMANDS,
  RELEASE_CONFIG_ASSET_PATHS,
  RELEASE_PLACEHOLDER_ASSET_PATHS,
  RELEASE_RUNTIME_ASSET_PATHS,
  RELEASE_RUNTIME_SEED_ASSET_PATHS,
  resolveReleaseBrainExcludePrefixes,
  resolveReleasePlanSnapshot,
} from "./lib/releaseBuildPlan";
import { shouldBundleBrainFile } from "./lib/releaseBundleFilter";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const DEFAULT_OUTPUT_ROOT = path.join(REPO_ROOT, "dist", "app");
const DEFAULT_FRONTEND_SURFACE = process.env.TRENCHCLAW_FRONTEND_SURFACE?.trim() || "gui";

interface CliArgs {
  outputRoot: string;
  version: string | null;
  frontendSurface: string;
}

const run = async (command: string[], cwd = REPO_ROOT): Promise<void> => {
  const [bin, ...args] = command;
  if (!bin) {
    throw new Error("Cannot run an empty command");
  }
  const proc = Bun.spawn([bin, ...args], {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env: process.env,
  });
  const code = (await proc.exited) ?? 1;
  if (code !== 0) {
    throw new Error(`Command failed (${code}): ${command.join(" ")}`);
  }
};

const parseArgs = (argv: string[]): CliArgs => {
  let outputRoot = DEFAULT_OUTPUT_ROOT;
  let version: string | null = null;
  let frontendSurface = DEFAULT_FRONTEND_SURFACE;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--output-root") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --output-root");
      }
      outputRoot = path.resolve(value);
      i += 1;
      continue;
    }
    if (arg === "--version") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --version");
      }
      version = value.trim();
      i += 1;
      continue;
    }
    if (arg === "--frontend-surface") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --frontend-surface");
      }
      frontendSurface = value.trim();
      i += 1;
    }
  }

  return { outputRoot, version, frontendSurface };
};

const runCapture = async (command: string[], cwd = REPO_ROOT): Promise<string> => {
  const [bin, ...args] = command;
  if (!bin) {
    throw new Error("Cannot run an empty command");
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
  return stdout;
};

const readRootPackageVersion = async (): Promise<string> => {
  const packageJsonPath = path.join(REPO_ROOT, "package.json");
  const packageJsonRaw = await readFile(packageJsonPath, "utf8");
  const packageJson = JSON.parse(packageJsonRaw) as { version?: unknown };
  if (typeof packageJson.version === "string" && packageJson.version.trim().length > 0) {
    return packageJson.version.trim();
  }
  return "0.0.0";
};

const toShortCommit = (value: string): string => value.trim().slice(0, 7);

const resolveFrontendSurfacePaths = async (frontendSurface: string): Promise<{
  id: string;
  root: string;
  distRoot: string;
}> => {
  const id = frontendSurface.trim();
  if (!id) {
    throw new Error("Frontend surface id must not be empty.");
  }

  const root = path.join(REPO_ROOT, "apps", "frontends", id);
  const packageJsonPath = path.join(root, "package.json");
  if (!(await Bun.file(packageJsonPath).exists())) {
    throw new Error(`Frontend surface "${id}" not found at ${root}`);
  }

  return {
    id,
    root,
    distRoot: path.join(root, "dist"),
  };
};

const resolveCommitFromEnv = (): string | null => {
  const envCommit =
    process.env.TRENCHCLAW_BUILD_COMMIT?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.GITHUB_SHA?.trim() ||
    process.env.CI_COMMIT_SHA?.trim() ||
    process.env.COMMIT_SHA?.trim();
  if (!envCommit) {
    return null;
  }
  return toShortCommit(envCommit);
};

const listFilesRecursive = async (directoryPath: string): Promise<string[]> => {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        return listFilesRecursive(entryPath);
      }
      if (entry.isFile()) {
        return [entryPath];
      }
      return [];
    }),
  );
  return nested.flat();
};

const resolveBuildMetadata = async (): Promise<{
  version: string;
  commit: string;
}> => {
  const packageVersion = await readRootPackageVersion();
  const configuredVersion = process.env.TRENCHCLAW_BUILD_VERSION?.trim();
  const configuredCommit = resolveCommitFromEnv();
  let gitShortSha = "local";
  if (!configuredCommit) {
    try {
      gitShortSha = (await runCapture(["git", "-C", REPO_ROOT, "rev-parse", "--short", "HEAD"])).trim();
    } catch {
      gitShortSha = "local";
    }
  }

  return {
    version: configuredVersion && configuredVersion.length > 0 ? configuredVersion : `v${packageVersion}`,
    commit: configuredCommit && configuredCommit.length > 0 ? configuredCommit : gitShortSha,
  };
};

const copyRelativeFile = async (input: {
  sourceRoot: string;
  targetRoot: string;
  relativePath: string;
}): Promise<void> => {
  const source = path.join(input.sourceRoot, input.relativePath);
  const target = path.join(input.targetRoot, input.relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target);
};

const copyReleaseBrainAssets = async (coreOutputRoot: string): Promise<void> => {
  let trackedFiles: string[] = [];
  const excludedPrefixes = resolveReleaseBrainExcludePrefixes();
  try {
    const raw = await runCapture([
      "git",
      "-C",
      REPO_ROOT,
      "ls-files",
      "-z",
      "--",
      "apps/trenchclaw/src/ai/brain",
    ]);
    trackedFiles = raw.split("\u0000").filter((entry) => entry.length > 0);
  } catch {
    const brainRoot = path.join(REPO_ROOT, "apps/trenchclaw/src/ai/brain");
    const discoveredFiles = await listFilesRecursive(brainRoot);
    trackedFiles = discoveredFiles.map((filePath) => path.relative(REPO_ROOT, filePath));
  }
  if (trackedFiles.length === 0) {
    throw new Error("No tracked brain assets found under apps/trenchclaw/src/ai/brain");
  }

  for (const trackedFile of trackedFiles) {
    if (!shouldBundleBrainFile(trackedFile, { excludedPrefixes })) {
      continue;
    }
    const source = path.join(REPO_ROOT, trackedFile);
    if (!(await Bun.file(source).exists())) {
      continue;
    }
    const relativePath = path.relative("apps/trenchclaw", trackedFile);
    const target = path.join(coreOutputRoot, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target);
  }
};

const copyReleaseConfigAssets = async (coreOutputRoot: string): Promise<void> => {
  for (const relativePath of RELEASE_CONFIG_ASSET_PATHS) {
    await copyRelativeFile({
      sourceRoot: path.join(REPO_ROOT, "apps/trenchclaw"),
      targetRoot: coreOutputRoot,
      relativePath,
    });
  }
};

const copyReleaseRuntimeAssets = async (coreOutputRoot: string): Promise<void> => {
  for (const relativePath of RELEASE_RUNTIME_ASSET_PATHS) {
    await copyRelativeFile({
      sourceRoot: path.join(REPO_ROOT, "apps/trenchclaw"),
      targetRoot: coreOutputRoot,
      relativePath,
    });
  }
};

const copyReleaseRuntimeSeedAssets = async (coreOutputRoot: string): Promise<void> => {
  for (const relativePath of RELEASE_RUNTIME_SEED_ASSET_PATHS) {
    await copyRelativeFile({
      sourceRoot: path.join(REPO_ROOT, "apps/trenchclaw"),
      targetRoot: coreOutputRoot,
      relativePath,
    });
  }
};

const ensurePlaceholderFile = async (filePath: string, contents = ""): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
};

const writeBundleManifest = async (outputRoot: string, buildMetadata: {
  version: string;
  commit: string;
}): Promise<void> => {
  const files = await listFilesRecursive(outputRoot);
  const manifest = await Promise.all(files.map(async (absolutePath) => ({
    path: path.relative(outputRoot, absolutePath).split(path.sep).join("/"),
    sizeBytes: Bun.file(absolutePath).size,
  })));

  await writeFile(
    path.join(outputRoot, "build-manifest.json"),
    `${JSON.stringify(
      {
        version: buildMetadata.version,
        commit: buildMetadata.commit,
        generatedAt: new Date().toISOString(),
        buildPlan: resolveReleasePlanSnapshot(),
        fileCount: manifest.length,
        files: manifest.toSorted((left, right) => left.path.localeCompare(right.path)),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const outputRoot = args.outputRoot;
  const guiOutputRoot = path.join(outputRoot, "gui");
  const coreOutputRoot = path.join(outputRoot, "core");
  const frontendSurface = await resolveFrontendSurfacePaths(args.frontendSurface);

  console.log("[build-app] cleaning old output");
  await rm(outputRoot, { recursive: true, force: true });

  if (args.version && args.version.length > 0) {
    process.env.TRENCHCLAW_BUILD_VERSION = args.version;
  }
  const buildMetadata = await resolveBuildMetadata();
  process.env.TRENCHCLAW_BUILD_VERSION = buildMetadata.version;
  process.env.TRENCHCLAW_BUILD_COMMIT = buildMetadata.commit;
  console.log(`[build-app] build metadata version=${buildMetadata.version} commit=${buildMetadata.commit}`);
  console.log(`[build-app] command bundle=${RELEASE_BUILD_COMMANDS.bundle}`);
  console.log(`[build-app] command verify=${RELEASE_BUILD_COMMANDS.verify}`);
  console.log(`[build-app] command package=${RELEASE_BUILD_COMMANDS.package}`);

  console.log(`[build-app] building frontend surface ${frontendSurface.id}`);
  await run(["bun", "run", "--cwd", path.relative(REPO_ROOT, frontendSurface.root), "build"]);

  console.log("[build-app] assembling release assets");
  await mkdir(outputRoot, { recursive: true });
  await cp(frontendSurface.distRoot, guiOutputRoot, { recursive: true });
  await copyReleaseBrainAssets(coreOutputRoot);
  await copyReleaseConfigAssets(coreOutputRoot);
  await copyReleaseRuntimeAssets(coreOutputRoot);
  await copyReleaseRuntimeSeedAssets(coreOutputRoot);
  for (const relativePath of RELEASE_PLACEHOLDER_ASSET_PATHS) {
    await ensurePlaceholderFile(path.join(coreOutputRoot, relativePath));
  }

  const metadata = {
    version: buildMetadata.version,
    commit: buildMetadata.commit,
    createdAt: new Date().toISOString(),
    layout: {
      frontendSurface: frontendSurface.id,
      gui: "gui",
      core: "core",
    },
  };
  await writeFile(path.join(outputRoot, "build-metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  await writeBundleManifest(outputRoot, buildMetadata);

  const notes = `# TrenchClaw Release Assets

This staging directory contains the readonly assets required for standalone desktop releases.

Included:
- Selected frontend surface build output in \`gui/\`
- readonly TrenchClaw brain/config assets in \`core/\`
- release-only runtime source needed for generated context artifacts in \`core/src/runtime/\`

Excluded intentionally:
- Bun runtime
- runtime databases, sessions, logs, and memory files
- local vault contents and wallet library data
- wallet keypairs beyond placeholder files
- test files, coverage output, and source maps
- skill installer shell scripts under knowledge/skills
`;
  await writeFile(path.join(outputRoot, "README.md"), notes, "utf8");

  console.log(`[build-app] done -> ${outputRoot}`);
};

await main();
