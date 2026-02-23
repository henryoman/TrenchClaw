import { renderWelcomeToTrenchClaw } from "./views/welcome";

export type CliMode = "dev" | "start" | "headless" | "cli";

export type CliCommand = "status" | "stop" | "pause" | "resume";

export interface ParsedCliArgs {
  mode?: CliMode;
  command?: CliCommand;
  botId?: string;
}

export const parseCliArgs = (argv: string[]): ParsedCliArgs => {
  const [, , ...rest] = argv;
  const [first, second, third] = rest;

  if (first === "dev" || first === "start" || first === "headless") {
    return { mode: first };
  }

  if (first === "cli" && (second === "status" || second === "stop")) {
    return { command: second };
  }

  if (first === "cli" && (second === "pause" || second === "resume")) {
    return { command: second, botId: third };
  }

  if (first === "cli" && !second) {
    return { mode: "cli" };
  }

  return {};
};

export const startCli = async (argv: string[] = Bun.argv): Promise<ParsedCliArgs> => {
  const parsedArgs = parseCliArgs(argv);

  if (parsedArgs.mode === "cli") {
    await renderWelcomeToTrenchClaw();
  }

  return parsedArgs;
};

export * from "./views";

if (import.meta.main) {
  await startCli(Bun.argv);
}
