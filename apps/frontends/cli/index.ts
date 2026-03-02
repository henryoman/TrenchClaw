import { existsSync, statSync } from "node:fs";
import path from "node:path";

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
const DEV_BOOTSTRAP_CREATE_WALLETS_ENABLED = process.env.DEV_BOOTSTRAP_CREATE_WALLETS === "1";
const TERMINAL_TELEMETRY_ENABLED = (process.env.TRENCHCLAW_TERMINAL_TELEMETRY ?? "1") !== "0";

const RELEASE_HEALTH_TIMEOUT_MS = Number.parseInt(process.env.RELEASE_HEALTH_TIMEOUT_MS || "30000", 10);
const HEALTH_POLL_MS = 250;

const REPO_ROOT = path.resolve(CORE_APP_ROOT, "../..");
const GUI_DIST_DIR = path.join(REPO_ROOT, "apps/frontends/gui/dist");
const GUI_INDEX_PATH = path.join(GUI_DIST_DIR, "index.html");

const contentTypeByExt = new Map<string, string>([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

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

  if (!first) {
    return { mode: "start" };
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

const waitForRuntimeHealth = async (runtimeUrl: string, timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  const healthUrl = `${runtimeUrl}/health`;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // Runtime still booting.
    }
    await Bun.sleep(HEALTH_POLL_MS);
  }

  throw new Error(`Runtime health check timed out after ${timeoutMs}ms (${healthUrl})`);
};

const openBrowser = async (url: string): Promise<void> => {
  const commands =
    process.platform === "darwin"
      ? [["open", url]]
      : process.platform === "win32"
        ? [["cmd", "/c", "start", "", url]]
        : [["xdg-open", url]];

  for (const command of commands) {
    try {
      const proc = Bun.spawn(command, {
        stdout: "ignore",
        stderr: "ignore",
      });
      const exited = await proc.exited;
      if ((exited ?? 0) === 0) {
        return;
      }
    } catch {
      // Try next opener.
    }
  }

  console.warn(`[gui] unable to auto-open browser; open manually: ${url}`);
};

const toAssetPath = (urlPathname: string): string => {
  const decoded = decodeURIComponent(urlPathname);
  const sanitized = decoded.replace(/^\/+/, "");
  return path.normalize(path.join(GUI_DIST_DIR, sanitized));
};

const proxyApiRequest = async (request: Request, runtimeBaseUrl: string): Promise<Response> => {
  const url = new URL(request.url);
  const upstreamUrl = new URL(`${url.pathname}${url.search}`, runtimeBaseUrl);

  return fetch(upstreamUrl, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });
};

const startGuiStaticServer = (input: {
  host: string;
  port: number;
  runtimeBaseUrl: string;
}): Bun.Server<unknown> => {
  if (!existsSync(GUI_INDEX_PATH)) {
    throw new Error(`GUI build output not found at ${GUI_INDEX_PATH}. Run: bun run release:gui:build`);
  }

  return Bun.serve({
    hostname: input.host,
    port: input.port,
    fetch: async (request: Request) => {
      const url = new URL(request.url);

      if (url.pathname.startsWith("/api/")) {
        return proxyApiRequest(request, input.runtimeBaseUrl);
      }

      const targetPath = toAssetPath(url.pathname);
      const isRegularFile = (() => {
        if (!targetPath.startsWith(GUI_DIST_DIR) || !existsSync(targetPath)) {
          return false;
        }

        try {
          return statSync(targetPath).isFile();
        } catch {
          return false;
        }
      })();

      if (isRegularFile) {
        const ext = path.extname(targetPath).toLowerCase();
        const contentType = contentTypeByExt.get(ext);
        const headers = contentType ? { "content-type": contentType } : undefined;
        return new Response(Bun.file(targetPath), { headers });
      }

      return new Response(Bun.file(GUI_INDEX_PATH), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    },
  });
};

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

        if (TERMINAL_TELEMETRY_ENABLED) {
          console.log(
            `[http] -> ${request.method} ${url.pathname}${url.search} from=${new URL(request.url).host}`,
          );
        }
        const startedAt = Date.now();
        const response = await webGuiApiHandler(request);
        if (TERMINAL_TELEMETRY_ENABLED) {
          console.log(
            `[http] <- ${request.method} ${url.pathname}${url.search} status=${response.status} durationMs=${Date.now() - startedAt}`,
          );
        }
        return response;
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

const installTerminalTelemetry = (runtime: RuntimeBootstrap): void => {
  if (!TERMINAL_TELEMETRY_ENABLED) {
    return;
  }

  runtime.eventBus.on("action:start", (event) => {
    console.log(
      `[telemetry] action:start name=${event.payload.actionName} key=${event.payload.idempotencyKey} input=${event.payload.inputSummary ?? "n/a"}`,
    );
  });

  runtime.eventBus.on("action:success", (event) => {
    console.log(
      `[telemetry] action:success name=${event.payload.actionName} key=${event.payload.idempotencyKey} durationMs=${event.payload.durationMs} tx=${event.payload.txSignature ?? "n/a"}`,
    );
  });

  runtime.eventBus.on("action:fail", (event) => {
    console.error(
      `[telemetry] action:fail name=${event.payload.actionName} key=${event.payload.idempotencyKey} attempts=${event.payload.attempts} retryable=${event.payload.retryable} error=${event.payload.error}`,
    );
  });

  runtime.eventBus.on("action:retry", (event) => {
    console.warn(
      `[telemetry] action:retry name=${event.payload.actionName} key=${event.payload.idempotencyKey} attempt=${event.payload.attempt} nextRetryMs=${event.payload.nextRetryMs}`,
    );
  });

  runtime.eventBus.on("policy:block", (event) => {
    console.error(
      `[telemetry] policy:block action=${event.payload.actionName} policy=${event.payload.policyName} reason=${event.payload.reason}`,
    );
  });

  runtime.eventBus.on("queue:enqueue", (event) => {
    console.log(
      `[telemetry] queue:enqueue job=${event.payload.jobId} bot=${event.payload.botId} routine=${event.payload.routineName} size=${event.payload.queueSize} pos=${event.payload.queuePosition}`,
    );
  });

  runtime.eventBus.on("queue:dequeue", (event) => {
    console.log(
      `[telemetry] queue:dequeue job=${event.payload.jobId} bot=${event.payload.botId} routine=${event.payload.routineName} waitMs=${event.payload.waitMs}`,
    );
  });

  runtime.eventBus.on("queue:complete", (event) => {
    console.log(
      `[telemetry] queue:complete job=${event.payload.jobId} bot=${event.payload.botId} routine=${event.payload.routineName} status=${event.payload.status} durationMs=${event.payload.durationMs}`,
    );
  });
};

const installShutdownHooks = (runtime: RuntimeBootstrap, guiServer?: Bun.Server<unknown>): void => {
  const shutdown = (signal: string) => {
    guiServer?.stop(true);
    runtime.stop();
    console.log(`[runtime] stopped after ${signal}`);
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
};

const launchRuntimeAndGui = async (runtime: RuntimeBootstrap): Promise<void> => {
  const runtimeServer = startRuntimeServer(runtime);
  await waitForRuntimeHealth(runtimeServer.url, RELEASE_HEALTH_TIMEOUT_MS);

  const preferredGuiPort = toPortNumber(process.env.GUI_PORT ?? "4173");
  const guiHost = process.env.RUNTIME_HOST ?? "127.0.0.1";

  let guiServer: Bun.Server<unknown>;
  try {
    guiServer = startGuiStaticServer({
      host: guiHost,
      port: preferredGuiPort,
      runtimeBaseUrl: runtimeServer.url,
    });
  } catch (error) {
    const isAddrInUse =
      error instanceof Error && "code" in error && (error as { code?: string }).code === "EADDRINUSE";
    if (!isAddrInUse) {
      throw error;
    }

    guiServer = startGuiStaticServer({
      host: guiHost,
      port: 0,
      runtimeBaseUrl: runtimeServer.url,
    });
  }

  const guiUrl = `http://${toHostName(guiServer.hostname)}:${guiServer.port ?? preferredGuiPort}`;
  process.env.TRENCHCLAW_GUI_URL = guiUrl;

  renderWelcomeToTrenchClaw({
    runtimeServerUrl: runtimeServer.url,
    webGuiUrl: guiUrl,
  });
  console.log(`[runtime] booted`, JSON.stringify(runtime.describe()));
  console.log(`[gui] serving production build at ${guiUrl}`);
  console.log(`[gui] press Ctrl+C to stop`);

  installShutdownHooks(runtime, guiServer);
  await openBrowser(guiUrl);
};

export const startCli = async (argv: string[] = Bun.argv): Promise<ParsedCliArgs> => {
  const parsedArgs = parseCliArgs(argv);

  if (!parsedArgs.mode) {
    return parsedArgs;
  }

  process.chdir(CORE_APP_ROOT);
  process.env.TRENCHCLAW_PROFILE = process.env.TRENCHCLAW_PROFILE ?? DEFAULT_RUNTIME_PROFILE;
  process.env.TRENCHCLAW_BOOT_REFRESH_CONTEXT = process.env.TRENCHCLAW_BOOT_REFRESH_CONTEXT ?? "1";
  process.env.TRENCHCLAW_BOOT_REFRESH_KNOWLEDGE = process.env.TRENCHCLAW_BOOT_REFRESH_KNOWLEDGE ?? "1";

  const runtime = await bootstrapRuntime();
  installTerminalTelemetry(runtime);

  if (parsedArgs.mode === "start") {
    await launchRuntimeAndGui(runtime);
    return parsedArgs;
  }

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

  if (parsedArgs.mode === "dev" && DEV_BOOTSTRAP_CREATE_WALLETS_ENABLED) {
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
