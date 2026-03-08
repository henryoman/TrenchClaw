#!/usr/bin/env bun

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const DEFAULT_OUTPUT_PATH = path.join(REPO_ROOT, "dist", "release", "release-notes.md");
const RECORD_SEPARATOR = "\u001e";
const FIELD_SEPARATOR = "\u001f";

interface CliArgs {
  version: string;
  outputPath: string;
}

interface CommitEntry {
  fullSha: string;
  shortSha: string;
  subject: string;
  author: string;
  date: string;
  body: string;
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

const normalizeTagName = (version: string): string | null => {
  const normalized = version.trim();
  if (!normalized || normalized === "unversioned") {
    return null;
  }
  return normalized.startsWith("v") ? normalized : `v${normalized}`;
};

const getReachableReleaseTags = async (): Promise<string[]> => {
  const output = await runCapture(["git", "tag", "--merged", "HEAD", "--sort=-version:refname", "--list", "v*"]);
  return output
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const resolveReleaseWindow = async (version: string): Promise<{
  currentTag: string | null;
  currentRef: string;
  previousTag: string | null;
  rangeArg: string;
}> => {
  const reachableTags = await getReachableReleaseTags();
  const currentTag = normalizeTagName(version);
  const currentTagExists = currentTag ? reachableTags.includes(currentTag) : false;
  const previousTag = reachableTags.find((tag) => tag !== currentTag) ?? null;
  const currentRef = currentTagExists && currentTag ? currentTag : "HEAD";
  const rangeArg = previousTag ? `${previousTag}..${currentRef}` : currentRef;

  return {
    currentTag: currentTagExists ? currentTag : null,
    currentRef,
    previousTag,
    rangeArg,
  };
};

const trimCommitBody = (subject: string, body: string): string => {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  if (lines[0]?.trim() === subject.trim()) {
    lines.shift();
  }
  return lines.join("\n").trim();
};

const parseCommitLog = (value: string): CommitEntry[] => {
  if (!value.trim()) {
    return [];
  }

  return value
    .split(RECORD_SEPARATOR)
    .map((record) => record.trim())
    .filter((record) => record.length > 0)
    .map((record) => {
      const [fullSha = "", shortSha = "", subject = "", author = "", date = "", rawBody = ""] = record.split(FIELD_SEPARATOR);
      return {
        fullSha,
        shortSha,
        subject: subject.trim(),
        author: author.trim(),
        date: date.trim(),
        body: trimCommitBody(subject, rawBody),
      };
    })
    .filter((entry) => entry.fullSha.length > 0 && entry.subject.length > 0);
};

const hasBreakingChange = (commit: CommitEntry): boolean => {
  const normalizedSubject = commit.subject.toLowerCase();
  const normalizedBody = commit.body.toLowerCase();
  return normalizedSubject.includes("!:") || normalizedBody.includes("breaking change");
};

const categorizeCommit = (commit: CommitEntry): string => {
  if (hasBreakingChange(commit)) return "Breaking Changes";
  const normalized = commit.subject.toLowerCase();
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
    "Breaking Changes",
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
    map.get(categorizeCommit(commit))?.push(commit);
  }
  return map;
};

const renderReleaseNotes = (input: {
  version: string;
  generatedAtIso: string;
  currentRef: string;
  currentTag: string | null;
  previousTag: string | null;
  commits: CommitEntry[];
}): string => {
  const groups = groupByCategory(input.commits);
  const lines: string[] = [];

  lines.push(`# Release ${input.version}`);
  lines.push("");
  lines.push(`Generated: ${input.generatedAtIso}`);
  lines.push(`Current release ref: ${input.currentTag ?? input.currentRef}`);
  lines.push(`Previous release tag: ${input.previousTag ?? "none"}`);
  lines.push(
    `Commit window: ${input.previousTag ? `${input.previousTag}..${input.currentTag ?? "HEAD"}` : `repository start..${input.currentTag ?? "HEAD"}`}`,
  );
  lines.push(`Total commits: ${input.commits.length}`);
  lines.push("");

  if (input.commits.length === 0) {
    lines.push("No commits found for this release window.");
    lines.push("");
    return lines.join("\n");
  }

  lines.push("## Grouped Summary");
  lines.push("");
  for (const [category, entries] of groups.entries()) {
    if (entries.length === 0) {
      continue;
    }
    lines.push(`### ${category}`);
    lines.push("");
    for (const entry of entries) {
      lines.push(`- ${entry.subject} (\`${entry.shortSha}\`) - ${entry.author} on ${entry.date}`);
    }
    lines.push("");
  }

  lines.push("## Full Commit Appendix");
  lines.push("");
  for (const entry of input.commits) {
    lines.push(`### ${entry.subject} (\`${entry.shortSha}\`)`);
    lines.push("");
    lines.push(`- Commit: \`${entry.fullSha}\``);
    lines.push(`- Category: ${categorizeCommit(entry)}`);
    lines.push(`- Author: ${entry.author}`);
    lines.push(`- Date: ${entry.date}`);
    if (entry.body.length > 0) {
      lines.push("- Body:");
      lines.push("```text");
      lines.push(entry.body);
      lines.push("```");
    }
    lines.push("");
  }

  return lines.join("\n");
};

const run = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const releaseWindow = await resolveReleaseWindow(args.version);
  const logOutput = await runCapture([
    "git",
    "log",
    releaseWindow.rangeArg,
    `--pretty=format:%H${FIELD_SEPARATOR}%h${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%ad${FIELD_SEPARATOR}%B${RECORD_SEPARATOR}`,
    "--date=short",
  ]);
  const commits = parseCommitLog(logOutput);
  const notes = renderReleaseNotes({
    version: args.version,
    generatedAtIso: new Date().toISOString(),
    currentRef: releaseWindow.currentRef,
    currentTag: releaseWindow.currentTag,
    previousTag: releaseWindow.previousTag,
    commits,
  });

  await mkdir(path.dirname(args.outputPath), { recursive: true });
  await writeFile(args.outputPath, notes, "utf8");
  console.log(`[release-notes] wrote ${args.outputPath} (${commits.length} commits)`);
};

await run();
