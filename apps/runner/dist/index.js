// @bun
// index.ts
import { existsSync, statSync } from "fs";
import path from "path";
import { createInterface } from "readline/promises";
var REPO_ROOT = path.resolve(import.meta.dir, "../..");
var RUNTIME_HOST = process.env.RUNTIME_HOST || "127.0.0.1";
var DEFAULT_RUNTIME_PORT = Number.parseInt(process.env.RUNTIME_PORT || "4020", 10);
var DEFAULT_GUI_PORT = Number.parseInt(process.env.GUI_PORT || "4173", 10);
var SHUTDOWN_GRACE_MS = Number.parseInt(process.env.RELEASE_SHUTDOWN_GRACE_MS || "2500", 10);
var GUI_IDLE_TIMEOUT_SECONDS = 255;
var ANSI = {
  reset: "\x1B[0m",
  neonTurquoise: "\x1B[38;2;0;245;212m",
  neonPurple: "\x1B[38;2;191;0;255m"
};
var supportsColor = Boolean(process.stdout.isTTY) && !("NO_COLOR" in process.env);
var colorize = (value, color) => supportsColor ? `${ANSI[color]}${value}${ANSI.reset}` : value;
var RUNNER_LOG_PREFIX = colorize("@trenclaw:", "neonPurple");
var emphasize = (value) => colorize(value, "neonTurquoise");
var GUI_DIST_DIR = path.join(REPO_ROOT, "apps/frontends/gui/dist");
var GUI_INDEX_PATH = path.join(GUI_DIST_DIR, "index.html");
var isValidPort = (value) => Number.isInteger(value) && value > 0 && value <= 65535;
var ensureValidPort = (value, label) => {
  if (!isValidPort(value)) {
    throw new Error(`Invalid ${label} port: ${value}`);
  }
  return value;
};
var canBindPort = async (host, port) => {
  try {
    const probe = Bun.serve({
      hostname: host,
      port,
      fetch: () => new Response("ok")
    });
    probe.stop(true);
    return true;
  } catch {
    return false;
  }
};
var findAvailablePort = async (host, preferredPort, label) => {
  const firstPort = ensureValidPort(preferredPort, label);
  const maxPort = Math.min(65535, firstPort + 200);
  for (let port = firstPort;port <= maxPort; port += 1) {
    if (await canBindPort(host, port)) {
      return port;
    }
  }
  throw new Error(`No available ${label} port found from ${firstPort} to ${maxPort}`);
};
var waitForExitOrTimeout = async (proc, timeoutMs) => await Promise.race([
  proc.exited.then(() => true),
  Bun.sleep(timeoutMs).then(() => false)
]);
var isSignalExitCode = (code) => code === 130 || code === 143;
var signalStop = (proc) => {
  if (proc.killed || proc.exitCode !== null) {
    return;
  }
  proc.kill("SIGTERM");
};
var forceStop = (proc) => {
  if (proc.killed || proc.exitCode !== null) {
    return;
  }
  proc.kill("SIGKILL");
};
var openBrowser = async (url) => {
  const commands = process.platform === "darwin" ? [["open", url]] : process.platform === "win32" ? [["cmd", "/c", "start", "", url]] : [["xdg-open", url]];
  for (const command of commands) {
    try {
      const proc = Bun.spawn(command, {
        stdout: "ignore",
        stderr: "ignore"
      });
      const exited = await proc.exited;
      if ((exited ?? 0) === 0) {
        return;
      }
    } catch {}
  }
  console.warn(`${RUNNER_LOG_PREFIX} unable to auto-open browser. open manually: ${emphasize(url)}`);
};
var shouldPromptForGuiLaunch = () => process.env.TRENCHCLAW_RUNNER_PROMPT_GUI_LAUNCH === "1" && Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);
var waitForGuiLaunchConfirmation = async () => {
  if (process.env.TRENCHCLAW_RUNNER_AUTO_OPEN_GUI === "1") {
    return true;
  }
  if (!shouldPromptForGuiLaunch()) {
    return false;
  }
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  try {
    const answer = (await prompt.question(`${RUNNER_LOG_PREFIX} launch GUI now? Press Enter to continue, or type "skip" to keep CLI-only: `)).trim().toLowerCase();
    return !(answer === "skip" || answer === "s");
  } finally {
    prompt.close();
  }
};
var contentTypeByExt = new Map([
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
  [".woff2", "font/woff2"]
]);
var toAssetPath = (urlPathname) => {
  const decoded = decodeURIComponent(urlPathname);
  const sanitized = decoded.replace(/^\/+/, "");
  return path.normalize(path.join(GUI_DIST_DIR, sanitized));
};
var proxyApiRequest = async (request, runtimeBaseUrl) => {
  const url = new URL(request.url);
  const upstreamUrl = new URL(`${url.pathname}${url.search}`, runtimeBaseUrl);
  const proxyInit = {
    method: request.method,
    headers: request.headers,
    body: request.body,
    duplex: request.body ? "half" : undefined
  };
  return fetch(upstreamUrl, proxyInit);
};
var createStaticServer = (input) => {
  return Bun.serve({
    hostname: input.host,
    port: input.port,
    idleTimeout: GUI_IDLE_TIMEOUT_SECONDS,
    fetch: async (request) => {
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
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    }
  });
};
var main = async () => {
  if (!existsSync(GUI_INDEX_PATH)) {
    throw new Error(`GUI build output not found at ${GUI_INDEX_PATH}. Run: bun run release:gui:build`);
  }
  const runtimePort = await findAvailablePort(RUNTIME_HOST, DEFAULT_RUNTIME_PORT, "runtime");
  const guiPort = runtimePort === DEFAULT_GUI_PORT ? await findAvailablePort(RUNTIME_HOST, DEFAULT_GUI_PORT + 1, "gui") : await findAvailablePort(RUNTIME_HOST, DEFAULT_GUI_PORT, "gui");
  const runtimeUrl = `http://${RUNTIME_HOST}:${runtimePort}`;
  const guiUrl = `http://${RUNTIME_HOST}:${guiPort}`;
  console.log(`${RUNNER_LOG_PREFIX} runtime target: ${emphasize(runtimeUrl)}`);
  console.log(`${RUNNER_LOG_PREFIX} gui target: ${emphasize(guiUrl)}`);
  const runtimeProc = Bun.spawn(["bun", "run", "--cwd", "apps/trenchclaw", "runtime:start"], {
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
      TRENCHCLAW_GUI_URL: guiUrl,
      TRENCHCLAW_BOOT_REFRESH_CONTEXT: process.env.TRENCHCLAW_BOOT_REFRESH_CONTEXT ?? "1",
      TRENCHCLAW_BOOT_REFRESH_KNOWLEDGE: process.env.TRENCHCLAW_BOOT_REFRESH_KNOWLEDGE ?? "1"
    }
  });
  let guiServer = null;
  let shuttingDown = false;
  let shutdownRequested = false;
  let shutdownPromise = null;
  const shutdown = (exitCode) => {
    if (shutdownPromise) {
      return shutdownPromise;
    }
    shuttingDown = true;
    process.exitCode = shutdownRequested ? 0 : exitCode;
    shutdownPromise = (async () => {
      signalStop(runtimeProc);
      const exitedGracefully = await waitForExitOrTimeout(runtimeProc, SHUTDOWN_GRACE_MS);
      if (!exitedGracefully) {
        console.warn(`${RUNNER_LOG_PREFIX} runtime did not exit after ${emphasize(`${SHUTDOWN_GRACE_MS}ms`)}; force-killing`);
        forceStop(runtimeProc);
        await waitForExitOrTimeout(runtimeProc, 1000);
      }
      guiServer?.stop(true);
    })();
    return shutdownPromise;
  };
  const handleTerminationSignal = () => {
    shutdownRequested = true;
    shutdown(0);
  };
  process.on("SIGINT", handleTerminationSignal);
  process.on("SIGTERM", handleTerminationSignal);
  process.on("SIGHUP", handleTerminationSignal);
  process.once("exit", () => {
    if (!shuttingDown) {
      signalStop(runtimeProc);
      guiServer?.stop(true);
    }
  });
  guiServer = createStaticServer({
    host: RUNTIME_HOST,
    port: guiPort,
    runtimeBaseUrl: runtimeUrl
  });
  console.log(`${RUNNER_LOG_PREFIX} GUI serving from ${emphasize(guiUrl)}`);
  const launchGui = await waitForGuiLaunchConfirmation();
  if (!launchGui) {
    console.log(`${RUNNER_LOG_PREFIX} GUI auto-launch disabled. Runtime remains active.`);
    console.log(`${RUNNER_LOG_PREFIX} Open manually when needed: ${emphasize(guiUrl)}`);
  } else {
    await openBrowser(guiUrl);
  }
  console.log(`${RUNNER_LOG_PREFIX} Press ${emphasize("Ctrl+C")} to stop.`);
  const runtimeExitCode = await runtimeProc.exited ?? 0;
  if (runtimeExitCode !== 0 && !(shutdownRequested && isSignalExitCode(runtimeExitCode))) {
    console.error(`${RUNNER_LOG_PREFIX} runtime exited with code ${runtimeExitCode}`);
    await shutdown(runtimeExitCode);
    return;
  }
  await shutdown(0);
};
await main();
