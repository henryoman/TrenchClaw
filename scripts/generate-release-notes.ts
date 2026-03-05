#!/usr/bin/env bun

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const DEFAULT_OUTPUT_PATH = path.join(REPO_ROOT, "dist", "release", "release-notes.md");

interface CliArgs {
  version: string;
  outputPath: string;
}

interface CommitEntry {
  shortSha: string;
  subject: string;
  author: string;
  date: string;
}

const parseArgs = (argv: string[]): CliArgs => {
  let version = "unversioned";
  let outputPath = DEFAULT_OUTPUT_PATH;

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
    if (arg === "--output") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --output");
      }
      outputPath = path.resolve(value);
      i += 1;
    }
  }

  return { version, outputPath };
};

const runCapture = async (command: string[]): Promise<string> => {
  const [bin, ...args] = command;
  const proc = Bun.spawn([bin, ...args], {
    cwd: REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "inherit",
    env: process.env,
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  if (exitCode !== 0) {
    throw new Error(`Command failed (${exitCode}): ${command.join(" ")}\n${stderr.trim()}`);
  }

  return stdout.trim();
};

const getLastReleaseTag = async (): Promise<string | null> => {
  try {
    const tag = await runCapture(["git", "describe", "--tags", "--abbrev=0", "--match", "v*"]);
    return tag.length > 0 ? tag : null;
  } catch {
    return null;
  }
};

const parseCommitLines = (value: string): CommitEntry[] => {
  if (!value.trim()) {
    return [];
  }
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [shortSha = "", subject = "", author = "", date = ""] = line.split("\t");
      return {
        shortSha,
        subject,
        author,
        date,
      };
    })
    .filter((entry) => entry.shortSha.length > 0 && entry.subject.length > 0);
};

const categorizeCommit = (subject: string): string => {
  const normalized = subject.toLowerCase();
  if (normalized.startsWith("feat:")) return "Features";
  if (normalized.startsWith("fix:")) return "Fixes";
  if (normalized.startsWith("perf:")) return "Performance";
  if (normalized.startsWith("refactor:")) return "Refactors";
  if (normalized.startsWith("docs:")) return "Docs";
  if (normalized.startsWith("test:")) return "Tests";
  if (normalized.startsWith("build:") || normalized.startsWith("chore:")) return "Build/Chores";
  if (normalized.startsWith("ci:")) return "CI";
  return "Other";
};

const groupByCategory = (commits: CommitEntry[]): Map<string, CommitEntry[]> => {
  const ordered = [
    "Features",
    "Fixes",
    "Performance",
    "Refactors",
    "Docs",
    "Tests",
    "Build/Chores",
    "CI",
    "Other",
  ];

  const map = new Map<string, CommitEntry[]>();
  for (const key of ordered) {
    map.set(key, []);
  }
  for (const commit of commits) {
    const key = categorizeCommit(commit.subject);
    map.get(key)?.push(commit);
  }
  return map;
};

const renderReleaseNotes = (input: {
  version: string;
  generatedAtIso: string;
  previousTag: string | null;
  commits: CommitEntry[];
}): string => {
  const { version, generatedAtIso, previousTag, commits } = input;
  const groups = groupByCategory(commits);
  const lines: string[] = [];

  lines.push(`# Release ${version}`);
  lines.push("");
  lines.push(`Generated: ${generatedAtIso}`);
  lines.push(`Previous release tag: ${previousTag ?? "none"}`);
  lines.push(`Commit window: ${previousTag ? `${previousTag}..HEAD` : "repository start..HEAD"}`);
  lines.push("");

  if (commits.length === 0) {
    lines.push("No commits found for this release window.");
    lines.push("");
    return lines.join("\n");
  }

  for (const [category, entries] of groups.entries()) {
    if (entries.length === 0) {
      continue;
    }
    lines.push(`## ${category}`);
    lines.push("");
    for (const entry of entries) {
      lines.push(`- ${entry.subject} (\`${entry.shortSha}\`) - ${entry.author} on ${entry.date}`);
    }
    lines.push("");
  }

  lines.push("## Full Commit List");
  lines.push("");
  for (const entry of commits) {
    lines.push(`- \`${entry.shortSha}\` ${entry.subject}`);
  }
  lines.push("");

  return lines.join("\n");
};

const run = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const previousTag = await getLastReleaseTag();
  const rangeArg = previousTag ? `${previousTag}..HEAD` : "HEAD";
  const logOutput = await runCapture([
    "git",
    "log",
    rangeArg,
    "--pretty=format:%h%x09%s%x09%an%x09%ad",
    "--date=short",
  ]);
  const commits = parseCommitLines(logOutput);
  const notes = renderReleaseNotes({
    version: args.version,
    generatedAtIso: new Date().toISOString(),
    previousTag,
    commits,
  });

  await mkdir(path.dirname(args.outputPath), { recursive: true });
  await writeFile(args.outputPath, notes, "utf8");
  console.log(`[release-notes] wrote ${args.outputPath} (${commits.length} commits)`);
};

await run();
