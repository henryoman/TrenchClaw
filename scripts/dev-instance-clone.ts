#!/usr/bin/env bun

import { DEV_INSTANCE_CLONE_PARTS, cloneDeveloperInstance, type DevInstanceClonePart } from "./lib/dev-runtime";

interface CliArgs {
  fromRoot: string;
  toRoot: string;
  fromInstanceId?: string;
  toInstanceId?: string;
  parts?: DevInstanceClonePart[];
  setActive: boolean;
}

const printHelp = (): void => {
  console.log(
    [
      "Usage: bun run scripts/dev-instance-clone.ts --from-root <path> --to-root <path> [options]",
      "",
      "Options:",
      "  --from-root <path>        Source runtime root",
      "  --to-root <path>          Target runtime root",
      "  --from-instance <id>      Source two-digit instance id (default: 00)",
      "  --to-instance <id>        Target two-digit instance id (default: source id)",
      `  --parts <list>            Comma-separated parts: ${DEV_INSTANCE_CLONE_PARTS.join(", ")}`,
      "  --no-set-active           Do not rewrite target active-instance.json",
      "  --help                    Show this help",
    ].join("\n"),
  );
};

const parseParts = (value: string | undefined): DevInstanceClonePart[] | undefined => {
  if (!value) {
    return undefined;
  }
  const parts = value.split(",").map((entry) => entry.trim()).filter(Boolean) as DevInstanceClonePart[];
  for (const part of parts) {
    if (!DEV_INSTANCE_CLONE_PARTS.includes(part)) {
      throw new Error(`Unsupported clone part "${part}". Expected one of: ${DEV_INSTANCE_CLONE_PARTS.join(", ")}`);
    }
  }
  return parts;
};

const parseArgs = (argv: string[]): CliArgs => {
  const args: Partial<CliArgs> = {
    setActive: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--from-root":
        args.fromRoot = argv[index + 1];
        index += 1;
        break;
      case "--to-root":
        args.toRoot = argv[index + 1];
        index += 1;
        break;
      case "--from-instance":
        args.fromInstanceId = argv[index + 1];
        index += 1;
        break;
      case "--to-instance":
        args.toInstanceId = argv[index + 1];
        index += 1;
        break;
      case "--parts":
        args.parts = parseParts(argv[index + 1]);
        index += 1;
        break;
      case "--no-set-active":
        args.setActive = false;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        if (arg?.startsWith("--")) {
          throw new Error(`Unknown argument: ${arg}`);
        }
        break;
    }
  }

  if (!args.fromRoot || !args.toRoot) {
    throw new Error("Both --from-root and --to-root are required.");
  }

  return args as CliArgs;
};

const args = parseArgs(process.argv.slice(2));
const result = await cloneDeveloperInstance({
  fromRoot: args.fromRoot,
  toRoot: args.toRoot,
  fromInstanceId: args.fromInstanceId,
  toInstanceId: args.toInstanceId,
  parts: args.parts,
  setActive: args.setActive,
});

console.log(`[dev-instance:clone] from ${result.fromRoot}/instances/${result.fromInstanceId}`);
console.log(`[dev-instance:clone] to   ${result.toRoot}/instances/${result.toInstanceId}`);
console.log(`[dev-instance:clone] parts: ${result.parts.join(", ")}`);
for (const copiedPath of result.copiedPaths) {
  console.log(`[dev-instance:clone] copied ${copiedPath}`);
}
