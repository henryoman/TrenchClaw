#!/usr/bin/env bun

import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

const SKIPPED_DIRECTORY_NAMES = new Set([
  ".git",
  ".idea",
  ".next",
  ".svelte-kit",
  ".turbo",
  ".vscode",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);

const shouldSkipDirectory = (directoryName: string): boolean =>
  SKIPPED_DIRECTORY_NAMES.has(directoryName);

const collectPackageDirectories = async (
  absoluteDirectory: string,
  relativeDirectory = ".",
): Promise<string[]> => {
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const packageDirectories: string[] = [];

  if (entries.some((entry) => entry.isFile() && entry.name === "package.json")) {
    packageDirectories.push(relativeDirectory);
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || shouldSkipDirectory(entry.name)) {
      continue;
    }

    const childAbsoluteDirectory = path.join(absoluteDirectory, entry.name);
    const childRelativeDirectory =
      relativeDirectory === "."
        ? entry.name
        : path.join(relativeDirectory, entry.name);

    packageDirectories.push(
      ...(await collectPackageDirectories(
        childAbsoluteDirectory,
        childRelativeDirectory,
      )),
    );
  }

  return packageDirectories;
};

const compareRelativeDirectories = (left: string, right: string): number => {
  const leftDepth = left === "." ? 0 : left.split(path.sep).length;
  const rightDepth = right === "." ? 0 : right.split(path.sep).length;
  return leftDepth - rightDepth || left.localeCompare(right);
};

const toDisplayDirectory = (relativeDirectory: string): string =>
  relativeDirectory === "."
    ? relativeDirectory
    : relativeDirectory.split(path.sep).join("/");

const run = async (command: string[], cwd: string): Promise<void> => {
  const [bin, ...args] = command;
  const proc = Bun.spawn([bin, ...args], {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env: process.env,
  });
  const exitCode = (await proc.exited) ?? 1;
  if (exitCode !== 0) {
    throw new Error(`Command failed (${exitCode}): ${command.join(" ")}`);
  }
};

const main = async (): Promise<void> => {
  console.log("[update-all] scanning for package.json files");
  const packageDirectories = [...new Set(await collectPackageDirectories(REPO_ROOT))]
    .sort(compareRelativeDirectories);

  if (packageDirectories.length === 0) {
    throw new Error("No package.json files found.");
  }

  console.log(
    `[update-all] found ${packageDirectories.length} package.json files`,
  );

  for (const relativeDirectory of packageDirectories) {
    const cwd =
      relativeDirectory === "."
        ? REPO_ROOT
        : path.join(REPO_ROOT, relativeDirectory);

    console.log(
      `[update-all] running bun update --latest in ${toDisplayDirectory(relativeDirectory)}`,
    );
    await run(["bun", "update", "--latest"], cwd);
  }

  console.log("[update-all] running bun upgrade");
  await run(["bun", "upgrade"], REPO_ROOT);
  console.log("[update-all] complete");
};

await main();
