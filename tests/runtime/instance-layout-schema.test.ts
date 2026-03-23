import { describe, expect, test } from "bun:test";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  INSTANCE_LAYOUT_DIRECTORY_PATHS,
  INSTANCE_LAYOUT_FILE_PATHS,
} from "../../apps/trenchclaw/src/runtime/instance-layout-schema";
import { coreAppPath } from "../helpers/core-paths";

const VOLATILE_RUNTIME_FILE_PATTERNS = [
  /^cache\/generated\/(?!\.gitkeep$).+$/u,
  /^cache\/memory\/(?!\.gitkeep$).+$/u,
  /^cache\/queue\.sqlite(?:-shm|-wal)?$/u,
  /^data\/runtime\.db(?:-shm|-wal)?$/u,
  /^logs\/live\/(?!\.gitkeep$).+$/u,
  /^logs\/sessions\/(?!\.gitkeep$).+$/u,
  /^logs\/summaries\/(?!\.gitkeep$).+$/u,
  /^logs\/system\/(?!\.gitkeep$).+$/u,
] as const;

const isVolatileRuntimeFile = (relativePath: string): boolean =>
  VOLATILE_RUNTIME_FILE_PATTERNS.some((pattern) => pattern.test(relativePath));

const listPaths = (root: string): { directories: string[]; files: string[] } => {
  const directories: string[] = [];
  const files: string[] = [];

  const walk = (absolutePath: string, relativePath: string): void => {
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      if (relativePath.length > 0) {
        directories.push(relativePath);
      }
      for (const entry of readdirSync(absolutePath, { withFileTypes: true })) {
        const childRelativePath = relativePath.length > 0 ? `${relativePath}/${entry.name}` : entry.name;
        walk(path.join(absolutePath, entry.name), childRelativePath);
      }
      return;
    }

    if (stat.isFile()) {
      files.push(relativePath);
    }
  };

  walk(root, "");

  return {
    directories: directories.toSorted((left, right) => left.localeCompare(right)),
    files: files.toSorted((left, right) => left.localeCompare(right)),
  };
};

describe("instance layout schema", () => {
  test("matches the tracked runtime seed instance exactly", () => {
    const trackedSeedRoot = coreAppPath(".runtime", "instances", "01");
    const tracked = listPaths(trackedSeedRoot);

    expect(tracked.directories).toEqual(INSTANCE_LAYOUT_DIRECTORY_PATHS);
    expect(tracked.files.filter((relativePath) => !isVolatileRuntimeFile(relativePath))).toEqual(INSTANCE_LAYOUT_FILE_PATHS);
  });
});
