import { renderWelcomeToTrenchClaw } from "./views/welcome";
import { bootstrapRuntime, type RuntimeBootstrap } from "../../trenchclaw/src/runtime/bootstrap";
import { createWebGuiApiHandler } from "./gui-transport";
import { CORE_APP_ROOT } from "./runtime-paths";

export type CliMode = "dev" | "start" | "headless" | "cli";
type RuntimeSafetyProfile = "safe" | "dangerous" | "veryDangerous";

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

const DEFAULT_RUNTIME_PROFILE: RuntimeSafetyProfile = "dangerous";

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

const toHostName = (value: string | undefined): string => value || "127.0.0.1";

export const startRuntimeServer = (
  runtime: RuntimeBootstrap,
): RuntimeServerInfo => {
  const host = process.env.RUNTIME_HOST ?? "127.0.0.1";
  const port = toPortNumber(process.env.RUNTIME_PORT);
  const strictPort = process.env.RUNTIME_STRICT_PORT === "1";
  const webGuiApiHandler = createWebGuiApiHandler(runtime);
  const createServer = (targetPort: number) =>
    Bun.serve({
      hostname: host,
      port: targetPort,
      fetch: async (request: Request) => {
        const url = new URL(request.url);
        if (request.method === "GET" && url.pathname === "/health") {
          return Response.json({
            ok: true,
            service: "trenchclaw-runtime",
            profile: runtime.settings.profile,
          });
        }

        if (request.method === "GET" && url.pathname === "/") {
          return Response.json({
            service: "trenchclaw-runtime",
            status: "running",
            runtime: runtime.describe(),
            apiBaseUrl: url.origin,
          });
        }

        return webGuiApiHandler(request);
      },
    });

  const server = (() => {
    try {
      return createServer(port);
    } catch (error) {
      const isAddrInUse =
        error instanceof Error && "code" in error && (error as { code?: string }).code === "EADDRINUSE";
      if (!isAddrInUse || strictPort) {
        throw error;
      }
      return createServer(0);
    }
  })();

  const hostname = toHostName(server.hostname);
  const activePort = server.port ?? port;

  return {
    host: hostname,
    port: activePort,
    url: `http://${hostname}:${activePort}`,
  };
};

const installShutdownHooks = (runtime: RuntimeBootstrap): void => {
  const shutdown = (signal: string) => {
    runtime.stop();
    console.log(`[runtime] stopped after ${signal}`);
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
};

export const startCli = async (argv: string[] = Bun.argv): Promise<ParsedCliArgs> => {
  const parsedArgs = parseCliArgs(argv);

  if (!parsedArgs.mode) {
    return parsedArgs;
  }

  process.chdir(CORE_APP_ROOT);
  process.env.TRENCHCLAW_PROFILE = process.env.TRENCHCLAW_PROFILE ?? DEFAULT_RUNTIME_PROFILE;

  const runtime = await bootstrapRuntime();
  let serverInfo: RuntimeServerInfo | null = null;
  try {
    serverInfo = startRuntimeServer(runtime);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[runtime] failed to start HTTP server: ${message}`);
    if (process.env.RUNTIME_REQUIRE_SERVER === "1") {
      runtime.stop();
      throw new Error(`Runtime HTTP server is required but failed to start: ${message}`);
    }
  }

  installShutdownHooks(runtime);

  if (parsedArgs.mode === "dev") {
    runtime.enqueueJob({
      botId: "dev-bootstrap",
      routineName: "createWallets",
      config: {},
    });
  }

  renderWelcomeToTrenchClaw({
    runtimeServerUrl: serverInfo?.url,
    webGuiUrl: process.env.TRENCHCLAW_GUI_URL,
  });
  console.log("[runtime] booted", JSON.stringify(runtime.describe()));
  console.log("[gui] run separately with `bun run gui:dev` or `bun run dev:parallel` from repo root");

  return parsedArgs;
};

export * from "./views";

if (import.meta.main) {
  await startCli(Bun.argv);
}
