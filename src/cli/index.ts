export type CliMode = "dev" | "start" | "headless";

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

  return {};
};

export const startCli = (argv: string[] = Bun.argv): ParsedCliArgs => {
  return parseCliArgs(argv);
};

export * from "./views";
