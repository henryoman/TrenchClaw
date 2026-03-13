#!/usr/bin/env bun

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { shouldBundleBrainFile } from "./lib/release-bundle-filter";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const OUTPUT_ROOT = path.join(REPO_ROOT, "dist", "app");
const GUI_OUTPUT_ROOT = path.join(OUTPUT_ROOT, "gui");
const CORE_OUTPUT_ROOT = path.join(OUTPUT_ROOT, "core");

const run = async (command: string[], cwd = REPO_ROOT): Promise<void> => {
  const [bin, ...args] = command;
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

const resolveBuildMetadata = async (): Promise<{
  version: string;
  commit: string;
}> => {
  const packageVersion = await readRootPackageVersion();
  const configuredVersion = process.env.TRENCHCLAW_BUILD_VERSION?.trim();
  const configuredCommit = process.env.TRENCHCLAW_BUILD_COMMIT?.trim();
  const gitShortSha = (await runCapture(["git", "-C", REPO_ROOT, "rev-parse", "--short", "HEAD"])).trim();

  return {
    version: configuredVersion && configuredVersion.length > 0 ? configuredVersion : `v${packageVersion}`,
    commit: configuredCommit && configuredCommit.length > 0 ? configuredCommit : gitShortSha,
  };
};

const copyReleaseBrainAssets = async (): Promise<void> => {
  const raw = await runCapture([
    "git",
    "-C",
    REPO_ROOT,
    "ls-files",
    "-z",
    "--",
    "apps/trenchclaw/src/ai/brain",
  ]);
  const trackedFiles = raw.split("\u0000").filter((entry) => entry.length > 0);
  if (trackedFiles.length === 0) {
    throw new Error("No tracked brain assets found under apps/trenchclaw/src/ai/brain");
  }

  for (const trackedFile of trackedFiles) {
    if (!shouldBundleBrainFile(trackedFile)) {
      continue;
    }
    const source = path.join(REPO_ROOT, trackedFile);
    if (!(await Bun.file(source).exists())) {
      continue;
    }
    const relativePath = path.relative("apps/trenchclaw", trackedFile);
    const target = path.join(CORE_OUTPUT_ROOT, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target);
  }
};

const copyReleaseConfigAssets = async (): Promise<void> => {
  await cp(path.join(REPO_ROOT, "apps/trenchclaw/src/ai/config"), path.join(CORE_OUTPUT_ROOT, "src/ai/config"), {
    recursive: true,
  });
};

const copyReleaseRuntimeAssets = async (): Promise<void> => {
  const routerSource = path.join(REPO_ROOT, "apps/trenchclaw/src/runtime/gui-transport/router.ts");
  const routerTarget = path.join(CORE_OUTPUT_ROOT, "src/runtime/gui-transport/router.ts");
  await mkdir(path.dirname(routerTarget), { recursive: true });
  await cp(routerSource, routerTarget);
};

const ensurePlaceholderFile = async (filePath: string, contents = ""): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
};

const main = async (): Promise<void> => {
  console.log("[build-app] cleaning old output");
  await rm(OUTPUT_ROOT, { recursive: true, force: true });

  const buildMetadata = await resolveBuildMetadata();
  process.env.TRENCHCLAW_BUILD_VERSION = buildMetadata.version;
  process.env.TRENCHCLAW_BUILD_COMMIT = buildMetadata.commit;
  console.log(`[build-app] build metadata version=${buildMetadata.version} commit=${buildMetadata.commit}`);

  console.log("[build-app] building GUI assets");
  await run(["bun", "run", "--cwd", "apps/frontends/gui", "build"]);

  console.log("[build-app] assembling release assets");
  await mkdir(OUTPUT_ROOT, { recursive: true });
  await cp(path.join(REPO_ROOT, "apps/frontends/gui/dist"), GUI_OUTPUT_ROOT, { recursive: true });
  await copyReleaseBrainAssets();
  await copyReleaseConfigAssets();
  await copyReleaseRuntimeAssets();
  await ensurePlaceholderFile(path.join(CORE_OUTPUT_ROOT, "src/ai/brain/protected/keypairs/.keep"));

  const metadata = {
    version: buildMetadata.version,
    commit: buildMetadata.commit,
    createdAt: new Date().toISOString(),
    layout: {
      gui: "gui",
      core: "core",
    },
  };
  await writeFile(path.join(OUTPUT_ROOT, "build-metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  const notes = `# TrenchClaw Release Assets

This staging directory contains the readonly assets required for standalone desktop releases.

Included:
- GUI build output in \`gui/\`
- readonly TrenchClaw brain/config assets in \`core/\`
- release-only runtime source needed for generated context artifacts in \`core/src/runtime/\`

Excluded intentionally:
- Bun runtime
- runtime databases, sessions, logs, and memory files
- local vault contents and wallet library data
- wallet keypairs beyond placeholder files
- skill installer shell scripts under knowledge/skills
`;
  await writeFile(path.join(OUTPUT_ROOT, "README.md"), notes, "utf8");

  console.log(`[build-app] done -> ${OUTPUT_ROOT}`);
};

await main();
