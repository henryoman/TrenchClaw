#!/usr/bin/env bun

type VersionSet = Set<string>;

const proc = Bun.spawnSync(["bun", "pm", "ls", "--all"], {
  cwd: process.cwd(),
  stdout: "pipe",
  stderr: "pipe",
});

if (proc.exitCode !== 0) {
  const stderr = Buffer.from(proc.stderr).toString("utf8").trim();
  console.error("Failed to inspect dependency graph with `bun pm ls --all`.");
  if (stderr) {
    console.error(stderr);
  }
  process.exit(proc.exitCode || 1);
}

const output = Buffer.from(proc.stdout).toString("utf8");
const versionsByName = new Map<string, VersionSet>();

for (const rawLine of output.split("\n")) {
  const line = rawLine.replace(/^[\s│├└─]+/, "");
  const match = line.match(/^((?:@[^@\s]+\/[^@\s]+)|(?:[^@\s]+))@([^\s]+)/);
  if (!match) {
    continue;
  }

  const [, name, version] = match;
  if (!versionsByName.has(name)) {
    versionsByName.set(name, new Set());
  }
  versionsByName.get(name)!.add(version);
}

const duplicates = [...versionsByName.entries()]
  .map(([name, versions]) => ({ name, versions: [...versions].sort() }))
  .filter((entry) => entry.versions.length > 1)
  .sort((a, b) => b.versions.length - a.versions.length || a.name.localeCompare(b.name));

if (duplicates.length === 0) {
  console.log("No duplicate package versions detected in `bun pm ls --all`.");
  process.exit(0);
}

console.log(`Detected ${duplicates.length} packages with multiple installed versions:\n`);
for (const entry of duplicates) {
  console.log(`${entry.name}: ${entry.versions.join(", ")}`);
}

process.exit(1);
