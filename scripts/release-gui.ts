#!/usr/bin/env bun

import { existsSync, statSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = process.cwd();
const RUNTIME_HOST = process.env.RUNTIME_HOST || "127.0.0.1";
const DEFAULT_RUNTIME_PORT = Number.parseInt(process.env.RUNTIME_PORT || "4020", 10);
const DEFAULT_GUI_PORT = Number.parseInt(process.env.GUI_PORT || "4173", 10);
const HEALTH_TIMEOUT_MS = Number.parseInt(process.env.RELEASE_HEALTH_TIMEOUT_MS || "30000", 10);
const SHUTDOWN_GRACE_MS = Number.parseInt(process.env.RELEASE_SHUTDOWN_GRACE_MS || "2500", 10);
const HEALTH_POLL_MS = 250;

const GUI_DIST_DIR = path.join(REPO_ROOT, "apps/frontends/gui/dist");
const GUI_INDEX_PATH = path.join(GUI_DIST_DIR, "index.html");
const CORE_APP_ROOT = path.join(REPO_ROOT, "apps/trenchclaw");

const isValidPort = (value: number): boolean => Number.isInteger(value) && value > 0 && value <= 65535;

const ensureValidPort = (value: number, label: string): number => {
  if (!isValidPort(value)) {
    throw new Error(`Invalid ${label} port: ${value}`);
  }
  return value;
};

const canBindPort = async (host: string, port: number): Promise<boolean> => {
  try {
    const probe = Bun.serve({
      hostname: host,
      port,
      fetch: () => new Response("ok"),
    });
    probe.stop(true);
    return true;
  } catch {
    return false;
  }
};

const findAvailablePort = async (host: string, preferredPort: number, label: string): Promise<number> => {
  const firstPort = ensureValidPort(preferredPort, label);
  const maxPort = Math.min(65535, firstPort + 200);

  for (let port = firstPort; port <= maxPort; port += 1) {
    if (await canBindPort(host, port)) {
      return port;
    }
  }

  throw new Error(`No available ${label} port found from ${firstPort} to ${maxPort}`);
};

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

const waitForExitOrTimeout = async (proc: Bun.Subprocess, timeoutMs: number): Promise<boolean> =>
  await Promise.race([
    proc.exited.then(() => true),
    Bun.sleep(timeoutMs).then(() => false),
  ]);

const signalStop = (proc: Bun.Subprocess): void => {
  if (proc.killed || proc.exitCode !== null) {
    return;
  }
  proc.kill("SIGTERM");
};

const forceStop = (proc: Bun.Subprocess): void => {
  if (proc.killed || proc.exitCode !== null) {
    return;
  }
  proc.kill("SIGKILL");
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

  console.warn(`[release] Unable to auto-open browser. Open manually: ${url}`);
};

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

const toAssetPath = (urlPathname: string): string => {
  const decoded = decodeURIComponent(urlPathname);
  const sanitized = decoded.replace(/^\/+/u, "");
  return path.normalize(path.join(GUI_DIST_DIR, sanitized));
};

const proxyApiRequest = async (request: Request, runtimeBaseUrl: string): Promise<Response> => {
  const url = new URL(request.url);
  const upstreamUrl = new URL(`${url.pathname}${url.search}`, runtimeBaseUrl);

  return fetch(upstreamUrl, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    duplex: request.body ? "half" : undefined,
  });
};

const createStaticServer = (input: { host: string; port: number; runtimeBaseUrl: string }): Bun.Server => {
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

const main = async (): Promise<void> => {
  if (!existsSync(GUI_INDEX_PATH)) {
    throw new Error(
      `GUI build output not found at ${GUI_INDEX_PATH}. Run: bun run release:gui:build`,
    );
  }

  const runtimePort = await findAvailablePort(RUNTIME_HOST, DEFAULT_RUNTIME_PORT, "runtime");
  const guiPort =
    runtimePort === DEFAULT_GUI_PORT
      ? await findAvailablePort(RUNTIME_HOST, DEFAULT_GUI_PORT + 1, "gui")
      : await findAvailablePort(RUNTIME_HOST, DEFAULT_GUI_PORT, "gui");

  const runtimeUrl = `http://${RUNTIME_HOST}:${runtimePort}`;
  const guiUrl = `http://${RUNTIME_HOST}:${guiPort}`;

  console.log(`[release] runtime target: ${runtimeUrl}`);
  console.log(`[release] gui target: ${guiUrl}`);

  const runtimeProc = Bun.spawn(["bun", "run", "--cwd", "apps/frontends/cli", "start"], {
    cwd: REPO_ROOT,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env: {
      ...process.env,
      RUNTIME_HOST,
      RUNTIME_PORT: String(runtimePort),
      RUNTIME_REQUIRE_SERVER: "1",
      RUNTIME_STRICT_PORT: "1",
      TRENCHCLAW_APP_ROOT: CORE_APP_ROOT,
      TRENCHCLAW_GUI_URL: guiUrl,
      TRENCHCLAW_BOOT_REFRESH_CONTEXT: "0",
      TRENCHCLAW_BOOT_REFRESH_KNOWLEDGE: "0",
    },
  });

  let guiServer: Bun.Server | null = null;
  let shuttingDown = false;
  let shutdownPromise: Promise<void> | null = null;

  const shutdown = (exitCode: number): Promise<void> => {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shuttingDown = true;
    process.exitCode = exitCode;

    shutdownPromise = (async () => {
      signalStop(runtimeProc);
      const exitedGracefully = await waitForExitOrTimeout(runtimeProc, SHUTDOWN_GRACE_MS);
      if (!exitedGracefully) {
        console.warn(`[release] runtime did not exit after ${SHUTDOWN_GRACE_MS}ms; force-killing`);
        forceStop(runtimeProc);
        await waitForExitOrTimeout(runtimeProc, 1000);
      }

      guiServer?.stop(true);
    })();

    return shutdownPromise;
  };

  process.once("SIGINT", () => void shutdown(0));
  process.once("SIGTERM", () => void shutdown(0));
  process.once("SIGHUP", () => void shutdown(0));
  process.once("exit", () => {
    if (!shuttingDown) {
      signalStop(runtimeProc);
      guiServer?.stop(true);
    }
  });

  try {
    await Promise.race([
      waitForRuntimeHealth(runtimeUrl, HEALTH_TIMEOUT_MS),
      runtimeProc.exited.then((code) => {
        throw new Error(`Runtime exited before becoming healthy (code ${code ?? 0})`);
      }),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[release] ${message}`);
    await shutdown(1);
    return;
  }

  guiServer = createStaticServer({
    host: RUNTIME_HOST,
    port: guiPort,
    runtimeBaseUrl: runtimeUrl,
  });

  console.log(`[release] GUI serving from ${guiUrl}`);
  console.log(`[release] Press Ctrl+C to stop.`);
  await openBrowser(guiUrl);

  const runtimeExitCode = (await runtimeProc.exited) ?? 0;
  if (runtimeExitCode !== 0) {
    console.error(`[release] runtime exited with code ${runtimeExitCode}`);
    await shutdown(runtimeExitCode);
    return;
  }

  await shutdown(0);
};

await main();
