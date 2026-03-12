#!/usr/bin/env bun

import path from "node:path";

type DependencyField = "dependencies" | "devDependencies" | "optionalDependencies" | "peerDependencies";

interface PackageManifest {
  workspaces?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface DependencyUse {
  packagePath: string;
  field: DependencyField;
  range: string;
}

const rootDir = process.cwd();
const rootManifestPath = path.join(rootDir, "package.json");
const rootManifest = await Bun.file(rootManifestPath).json() as PackageManifest;
const workspacePaths = [".", ...(rootManifest.workspaces ?? [])];
const dependencyFields: DependencyField[] = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

const usesByName = new Map<string, DependencyUse[]>();

for (const workspacePath of workspacePaths) {
  const manifestPath = path.join(rootDir, workspacePath, "package.json");
  const manifestFile = Bun.file(manifestPath);
  if (!(await manifestFile.exists())) {
    continue;
  }

  const manifest = await manifestFile.json() as PackageManifest;
  for (const field of dependencyFields) {
    const dependencies = manifest[field];
    if (!dependencies) {
      continue;
    }
    for (const [name, range] of Object.entries(dependencies)) {
      if (!usesByName.has(name)) {
        usesByName.set(name, []);
      }
      usesByName.get(name)!.push({
        packagePath: workspacePath,
        field,
        range,
      });
    }
  }
}

const duplicates = [...usesByName.entries()]
  .map(([name, uses]) => ({
    name,
    uses,
    uniqueRanges: [...new Set(uses.map((entry) => entry.range))].sort(),
  }))
  .filter((entry) => entry.uniqueRanges.length > 1)
  .sort((a, b) => b.uniqueRanges.length - a.uniqueRanges.length || a.name.localeCompare(b.name));

if (duplicates.length === 0) {
  console.log("No duplicate direct dependency ranges detected across workspace manifests.");
  process.exit(0);
}

console.log(`Detected ${duplicates.length} direct dependencies with mismatched ranges across workspace manifests:\n`);
for (const entry of duplicates) {
  console.log(`${entry.name}: ${entry.uniqueRanges.join(", ")}`);
  for (const use of entry.uses.sort((a, b) => a.packagePath.localeCompare(b.packagePath) || a.field.localeCompare(b.field))) {
    console.log(`  - ${use.packagePath} (${use.field}): ${use.range}`);
  }
  console.log("");
}

process.exit(1);
