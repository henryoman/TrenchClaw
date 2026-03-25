import { bootstrapRuntime, type RuntimeBootstrap } from "./bootstrap";
import { createRuntimeApiHandler } from "./surface/index";

export interface RuntimeServerInfo {
  host: string;
  port: number;
  url: string;
  stop: () => Promise<void>;
}

interface RuntimeBootSummary {
  profile: string;
  pendingJobs: number;
  schedulerTickMs: number;
  llmEnabled: boolean;
  llmModel: string | null;
  sessionId: string | null;
}

const DEFAULT_RUNTIME_PROFILE = "dangerous";
const RUNTIME_IDLE_TIMEOUT_SECONDS = 255;

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

const toRuntimeBootSummary = (runtime: RuntimeBootstrap): RuntimeBootSummary => {
  const description = runtime.describe();
  return {
    profile: description.profile,
    pendingJobs: description.pendingJobs,
    schedulerTickMs: description.schedulerTickMs,
    llmEnabled: description.llmEnabled,
    llmModel: description.llmModel ?? null,
    sessionId: description.sessionId ?? null,
  };
};

export const startRuntimeServer = (runtime: RuntimeBootstrap): RuntimeServerInfo => {
  const host = process.env.RUNTIME_HOST ?? "127.0.0.1";
  const port = toPortNumber(process.env.RUNTIME_PORT);
  const strictPort = process.env.RUNTIME_STRICT_PORT === "1";
  const runtimeApiHandler = createRuntimeApiHandler(runtime);
  const createServer = (targetPort: number) =>
    Bun.serve({
      hostname: host,
      port: targetPort,
      idleTimeout: RUNTIME_IDLE_TIMEOUT_SECONDS,
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

        return runtimeApiHandler(request);
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
    stop: async () => {
      server.stop(true);
    },
  };
};

export const installRuntimeShutdownHooks = (runtime: RuntimeBootstrap): void => {
  const shutdown = (signal: string) => {
    void runtime.stop().finally(() => {
      console.log(`[runtime] stopped after ${signal}`);
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
};

const start = async (): Promise<void> => {
  process.env.TRENCHCLAW_PROFILE = process.env.TRENCHCLAW_PROFILE ?? DEFAULT_RUNTIME_PROFILE;
  process.env.TRENCHCLAW_BOOT_REFRESH_CONTEXT = process.env.TRENCHCLAW_BOOT_REFRESH_CONTEXT ?? "0";
  process.env.TRENCHCLAW_BOOT_REFRESH_KNOWLEDGE = process.env.TRENCHCLAW_BOOT_REFRESH_KNOWLEDGE ?? "0";

  const runtime = await bootstrapRuntime();
  const serverInfo = startRuntimeServer(runtime);
  installRuntimeShutdownHooks(runtime);

  console.log(`[runtime] API server listening at ${serverInfo.url}`);
  console.log("[runtime] booted", JSON.stringify(toRuntimeBootSummary(runtime)));
};

if (import.meta.main) {
  await start();
}
