#!/usr/bin/env bun

import path from "node:path";

const REPO_ROOT = process.cwd();
const DEFAULT_FRONTEND_SURFACE = process.env.TRENCHCLAW_FRONTEND_SURFACE?.trim() || "gui";

const run = async (): Promise<void> => {
  const [scriptName, requestedSurface] = process.argv.slice(2);
  if (!scriptName) {
    throw new Error("Usage: bun run scripts/run-frontend.ts <script> [frontend-surface]");
  }

  const frontendSurface = (requestedSurface?.trim() || DEFAULT_FRONTEND_SURFACE).trim();
  if (!frontendSurface) {
    throw new Error("Frontend surface id must not be empty.");
  }

  const frontendRoot = path.join(REPO_ROOT, "apps/frontends", frontendSurface);
  const packageJsonPath = path.join(frontendRoot, "package.json");
  if (!(await Bun.file(packageJsonPath).exists())) {
    throw new Error(`Frontend surface "${frontendSurface}" not found at ${frontendRoot}`);
  }

  const proc = Bun.spawn(["bun", "run", scriptName], {
    cwd: frontendRoot,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env: {
      ...process.env,
      TRENCHCLAW_FRONTEND_SURFACE: frontendSurface,
    },
  });
  const exitCode = await proc.exited;
  if ((exitCode ?? 1) !== 0) {
    throw new Error(`Frontend command failed (${exitCode ?? 1}): ${scriptName}`);
  }
};

await run();
