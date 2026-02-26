import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

const BUILD_ARTIFACT_DIRECTORIES = [
  "apps/frontends/cli/dist",
  "apps/frontends/gui/dist",
  "apps/trenchclaw/dist",
  "website/.svelte-kit",
  "website/build",
];

const removeDirectory = async (relativePath: string): Promise<boolean> => {
  const absolutePath = path.join(REPO_ROOT, relativePath);
  try {
    await rm(absolutePath, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
};

let removedCount = 0;
for (const directory of BUILD_ARTIFACT_DIRECTORIES) {
  if (await removeDirectory(directory)) {
    removedCount += 1;
  }
}

console.log(`Build artifact cleanup complete (directories targeted: ${BUILD_ARTIFACT_DIRECTORIES.length}, removed: ${removedCount}).`);
