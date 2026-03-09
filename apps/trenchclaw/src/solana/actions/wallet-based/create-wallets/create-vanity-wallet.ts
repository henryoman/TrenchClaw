#!/usr/bin/env bun
import { $ } from "bun";
import path from "node:path";

type MatchMode = "starts-with" | "ends-with" | "starts-and-ends-with";

interface VanityArgs {
  mode: MatchMode;
  prefix?: string;
  suffix?: string;
  count: number;
  numThreads?: number;
  ignoreCase: boolean;
  useMnemonic: boolean;
  noBip39Passphrase: boolean;
  outputDir?: string;
  noOutfile: boolean;
}

const HELP_TEXT = `
Create vanity Solana wallets via solana-keygen grind.

Usage:
  bun run src/solana/actions/wallet-based/create-wallets/create-vanity-wallet.ts --starts-with <prefix> [options]
  bun run src/solana/actions/wallet-based/create-wallets/create-vanity-wallet.ts --ends-with <suffix> [options]
  bun run src/solana/actions/wallet-based/create-wallets/create-vanity-wallet.ts --starts-and-ends-with <prefix> <suffix> [options]

Options:
  --starts-with <prefix>               Match wallet addresses that start with <prefix>
  --ends-with <suffix>                 Match wallet addresses that end with <suffix>
  --starts-and-ends-with <p> <s>       Match wallet addresses with prefix <p> and suffix <s>
  --count <n>                          Number of matches to find (default: 1)
  --num-threads <n>                    Threads for solana-keygen grind
  --ignore-case                        Case-insensitive matching
  --use-mnemonic                       Use mnemonic generation mode (slower)
  --no-bip39-passphrase                Disable BIP39 passphrase prompt
  --no-outfile                         Do not save keypair files
  --output-dir <path>                  Directory where keypair files are written
  -h, --help                           Show this help
`;

const fail = (message: string): never => {
  console.error(`Error: ${message}`);
  console.error(HELP_TEXT.trim());
  process.exit(1);
  throw new Error(message);
};

const parsePositiveInteger = (value: string, flag: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    fail(`${flag} must be a positive integer`);
  }
  return parsed;
};

const ensureSingleMode = (currentMode: MatchMode | null, nextMode: MatchMode): MatchMode => {
  if (currentMode && currentMode !== nextMode) {
    fail("Only one match mode can be provided");
  }
  return nextMode;
};

const expectString = (value: string | undefined, message: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    fail(message);
  }
  return value as string;
};

const parseArgs = (argv: string[]): VanityArgs => {
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(HELP_TEXT.trim());
    process.exit(0);
  }

  let mode: MatchMode | null = null;
  let prefix: string | undefined;
  let suffix: string | undefined;
  let count = 1;
  let numThreads: number | undefined;
  let ignoreCase = false;
  let useMnemonic = false;
  let noBip39Passphrase = false;
  let outputDir: string | undefined;
  let noOutfile = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--starts-with": {
        mode = ensureSingleMode(mode, "starts-with");
        const value = argv[index + 1];
        if (!value || value.startsWith("-")) {
          fail("--starts-with requires a prefix value");
        }
        prefix = value;
        index += 1;
        break;
      }
      case "--ends-with": {
        mode = ensureSingleMode(mode, "ends-with");
        const value = argv[index + 1];
        if (!value || value.startsWith("-")) {
          fail("--ends-with requires a suffix value");
        }
        suffix = value;
        index += 1;
        break;
      }
      case "--starts-and-ends-with": {
        mode = ensureSingleMode(mode, "starts-and-ends-with");
        const nextPrefix = argv[index + 1];
        const nextSuffix = argv[index + 2];
        if (!nextPrefix || nextPrefix.startsWith("-") || !nextSuffix || nextSuffix.startsWith("-")) {
          fail("--starts-and-ends-with requires both <prefix> and <suffix>");
        }
        prefix = nextPrefix;
        suffix = nextSuffix;
        index += 2;
        break;
      }
      case "--count": {
        const value = expectString(argv[index + 1], "--count requires a value");
        count = parsePositiveInteger(value, "--count");
        index += 1;
        break;
      }
      case "--num-threads": {
        const value = expectString(argv[index + 1], "--num-threads requires a value");
        numThreads = parsePositiveInteger(value, "--num-threads");
        index += 1;
        break;
      }
      case "--ignore-case": {
        ignoreCase = true;
        break;
      }
      case "--use-mnemonic": {
        useMnemonic = true;
        break;
      }
      case "--no-bip39-passphrase": {
        noBip39Passphrase = true;
        break;
      }
      case "--output-dir": {
        const value = argv[index + 1];
        if (!value || value.startsWith("-")) {
          fail("--output-dir requires a path");
        }
        outputDir = value;
        index += 1;
        break;
      }
      case "--no-outfile": {
        noOutfile = true;
        break;
      }
      default: {
        fail(`Unknown argument: ${arg}`);
      }
    }
  }

  if (mode === null) {
    fail("You must provide one match mode: --starts-with, --ends-with, or --starts-and-ends-with");
  }

  if (mode === "starts-with" && !prefix) {
    fail("--starts-with mode requires a prefix");
  }
  if (mode === "ends-with" && !suffix) {
    fail("--ends-with mode requires a suffix");
  }
  if (mode === "starts-and-ends-with" && (!prefix || !suffix)) {
    fail("--starts-and-ends-with mode requires both prefix and suffix");
  }

  const resolvedMode = mode as MatchMode;

  return {
    mode: resolvedMode,
    prefix,
    suffix,
    count,
    numThreads,
    ignoreCase,
    useMnemonic,
    noBip39Passphrase,
    outputDir,
    noOutfile,
  };
};

const ensureSolanaKeygenAvailable = async (): Promise<void> => {
  try {
    await $`solana-keygen --version`.quiet();
  } catch {
    fail("solana-keygen is not installed or not on PATH");
  }
};

const buildModeArg = (args: VanityArgs): string => {
  if (args.mode === "starts-with") {
    return `${expectString(args.prefix, "--starts-with mode requires a prefix")}:${args.count}`;
  }
  if (args.mode === "ends-with") {
    return `${expectString(args.suffix, "--ends-with mode requires a suffix")}:${args.count}`;
  }
  return `${expectString(args.prefix, "--starts-and-ends-with mode requires a prefix")}:${expectString(args.suffix, "--starts-and-ends-with mode requires a suffix")}:${args.count}`;
};

const run = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  await ensureSolanaKeygenAvailable();

  const resolvedOutputDir = args.outputDir ? path.resolve(args.outputDir) : process.cwd();

  await $`mkdir -p ${resolvedOutputDir}`.quiet();

  const commandArgs = ["grind", `--${args.mode}`, buildModeArg(args)];
  if (args.numThreads !== undefined) {
    commandArgs.push("--num-threads", String(args.numThreads));
  }
  if (args.ignoreCase) {
    commandArgs.push("--ignore-case");
  }
  if (args.useMnemonic) {
    commandArgs.push("--use-mnemonic");
  }
  if (args.noBip39Passphrase) {
    commandArgs.push("--no-bip39-passphrase");
  }
  if (args.noOutfile) {
    if (!args.useMnemonic) {
      commandArgs.push("--use-mnemonic");
      console.log("Note: --no-outfile requires --use-mnemonic; enabling it automatically.");
    }
    commandArgs.push("--no-outfile");
  }

  console.log(`Running in ${resolvedOutputDir}`);
  console.log(`Mode: ${args.mode}, count: ${args.count}`);

  await $`solana-keygen ${commandArgs}`.cwd(resolvedOutputDir);
};

await run().catch((error: unknown) => {
  if (error && typeof error === "object") {
    const maybeError = error as { stderr?: Buffer; message?: string; exitCode?: number };
    if (maybeError.stderr) {
      console.error(maybeError.stderr.toString() || maybeError.message || "Command failed");
      process.exit(maybeError.exitCode || 1);
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
