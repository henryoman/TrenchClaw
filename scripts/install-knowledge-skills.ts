#!/usr/bin/env bun

import { access } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const KNOWLEDGE_SKILLS_DEST = path.join(REPO_ROOT, "apps/trenchclaw/src/ai/brain/knowledge/skills");

const INSTALLER_PATH = path.join(
  process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex"),
  "skills/.system/skill-installer/scripts/install-skill-from-github.py",
);

const args = Bun.argv.slice(2);
const passthroughArgs = args.filter((arg) => arg !== "--experimental" && arg !== "--no-refresh");
const useExperimental = args.includes("--experimental");
const skipRefresh = args.includes("--no-refresh");

const includesOption = (name: string): boolean => passthroughArgs.includes(name);

const hasExplicitInstallerSource =
  includesOption("--repo") || includesOption("--url") || includesOption("--path");

const positionalSkillNames = passthroughArgs.filter((arg) => !arg.startsWith("-"));

const usage = (): void => {
  console.log(`Install skills into product knowledge folder.

Usage:
  bun run knowledge:skills:add <skill-name> [skill-name...]
  bun run knowledge:skills:add --experimental <skill-name> [skill-name...]
  bun run knowledge:skills:add --repo <owner/repo> --path <path> [<path>...]
  bun run knowledge:skills:add --url <github-tree-url>

Wrapper-only options:
  --experimental  Use openai/skills experimental catalog for positional names
  --no-refresh    Skip knowledge manifest refresh after install

Notes:
  - Destination is always: ${KNOWLEDGE_SKILLS_DEST}
  - Raw installer flags are passed through except --dest, which is controlled by this command
`);
};

const run = async (): Promise<void> => {
  try {
    await access(INSTALLER_PATH);
  } catch {
    console.error(`Skill installer not found: ${INSTALLER_PATH}`);
    console.error("Install or expose the skill-installer under $CODEX_HOME/skills/.system first.");
    process.exit(1);
  }

  const python = Bun.which("python3") ?? Bun.which("python");
  if (!python) {
    console.error("python3 (or python) is required to run the skill installer.");
    process.exit(1);
  }

  if (!hasExplicitInstallerSource && positionalSkillNames.length === 0) {
    usage();
    process.exit(1);
  }

  const installerArgs: string[] = [];

  if (!hasExplicitInstallerSource) {
    const catalogPath = useExperimental ? "skills/.experimental" : "skills/.curated";
    installerArgs.push("--repo", "openai/skills", "--path");
    for (const skillName of positionalSkillNames) {
      installerArgs.push(`${catalogPath}/${skillName}`);
    }
  } else {
    for (let index = 0; index < passthroughArgs.length; index += 1) {
      const arg = passthroughArgs[index];
      if (arg === "--dest") {
        index += 1;
        continue;
      }
      installerArgs.push(arg);
    }
  }

  const installProc = Bun.spawn([python, INSTALLER_PATH, ...installerArgs, "--dest", KNOWLEDGE_SKILLS_DEST], {
    cwd: REPO_ROOT,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env: process.env,
  });

  const installCode = await installProc.exited;
  if ((installCode ?? 1) !== 0) {
    process.exit(installCode ?? 1);
  }

  if (skipRefresh) {
    console.log("Skill install complete (knowledge refresh skipped).");
    return;
  }

  const refreshProc = Bun.spawn(["bun", "run", "--cwd", "apps/trenchclaw", "knowledge:refresh"], {
    cwd: REPO_ROOT,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env: process.env,
  });

  const refreshCode = await refreshProc.exited;
  if ((refreshCode ?? 1) !== 0) {
    process.exit(refreshCode ?? 1);
  }
};

await run();
