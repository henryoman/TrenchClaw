import { renderWelcomeToTrenchClaw } from "./views/welcome";

export type CliMode = "dev" | "start" | "headless" | "cli";

export type CliCommand = "status" | "stop" | "pause" | "resume";

export interface ParsedCliArgs {
  mode?: CliMode;
  command?: CliCommand;
  botId?: string;
}

export interface RuntimeServerInfo {
  host: string;
  port: number;
  url: string;
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

const toPortNumber = (value: string | undefined): number => {
  if (!value) {
    return 4020;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    return 4020;
  }

  return parsed;
};

export const startRuntimeServer = (): RuntimeServerInfo => {
  const host = process.env.RUNTIME_HOST ?? "127.0.0.1";
  const port = toPortNumber(process.env.RUNTIME_PORT);

  const server = Bun.serve({
    hostname: host,
    port,
    routes: {
      "/health": () => Response.json({ ok: true, service: "trenchclaw-runtime" }),
      "/": () =>
        Response.json({
          service: "trenchclaw-runtime",
          status: "running",
          placeholders: ["config", "bots", "actions", "telemetry"],
        }),
    },
    fetch: () => new Response("Not Found", { status: 404 }),
  });

  return {
    host: server.hostname,
    port: server.port,
    url: `http://${server.hostname}:${server.port}`,
  };
};

export const startCli = async (argv: string[] = Bun.argv): Promise<ParsedCliArgs> => {
  const parsedArgs = parseCliArgs(argv);

  if (!parsedArgs.mode) {
    return parsedArgs;
  }

  const serverInfo = startRuntimeServer();
  renderWelcomeToTrenchClaw({ runtimeServerUrl: serverInfo.url });

  return parsedArgs;
};

export * from "./views";

if (import.meta.main) {
  await startCli(Bun.argv);
}
