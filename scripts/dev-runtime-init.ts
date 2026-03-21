#!/usr/bin/env bun

import { getDefaultDeveloperRuntimeRoots, initializeDeveloperRuntime } from "./lib/dev-runtime";

interface CliArgs {
  runtimeRoot?: string;
  generatedRoot?: string;
  instanceId?: string;
  instanceName?: string;
  writeGitignore: boolean;
}

const printHelp = (): void => {
  console.log(
    [
      "Usage: bun run scripts/dev-runtime-init.ts [options]",
      "",
      "Options:",
      "  --runtime-root <path>     External runtime root (default: ~/trenchclaw-dev-runtime)",
      "  --generated-root <path>   Generated root override (default: <runtime-root>/instances/<id>/cache/generated)",
      "  --instance <id>           Two-digit instance id (default: 01)",
      "  --instance-name <name>    Instance display name (default: default for 01, otherwise instance-<id>)",
      "  --no-gitignore            Do not write the managed .gitignore block",
      "  --help                    Show this help",
    ].join("\n"),
  );
};

const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = {
    writeGitignore: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--runtime-root":
        args.runtimeRoot = argv[index + 1];
        index += 1;
        break;
      case "--generated-root":
        args.generatedRoot = argv[index + 1];
        index += 1;
        break;
      case "--instance":
        args.instanceId = argv[index + 1];
        index += 1;
        break;
      case "--instance-name":
        args.instanceName = argv[index + 1];
        index += 1;
        break;
      case "--no-gitignore":
        args.writeGitignore = false;
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

  return args;
};

const defaults = getDefaultDeveloperRuntimeRoots();
const args = parseArgs(process.argv.slice(2));
const result = await initializeDeveloperRuntime({
  runtimeRoot: args.runtimeRoot ?? defaults.runtimeRoot,
  generatedRoot: args.generatedRoot ?? defaults.generatedRoot,
  instanceId: args.instanceId,
  instanceName: args.instanceName,
  writeGitignore: args.writeGitignore,
});

console.log(`[dev-runtime:init] runtime root: ${result.runtimeRoot}`);
console.log(`[dev-runtime:init] generated root: ${result.generatedRoot}`);
console.log(`[dev-runtime:init] active instance: ${result.instanceId}`);
console.log("");
console.log("Export these before local development:");
console.log(`export TRENCHCLAW_RUNTIME_STATE_ROOT="${result.runtimeRoot}"`);
