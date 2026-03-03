import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";

const resolveAppRoot = (): string => {
  const candidates = [
    path.resolve(import.meta.dir, "../.."),
    path.resolve(import.meta.dir, "../../.."),
    process.cwd(),
  ];

  for (const candidate of candidates) {
    if (
      existsSync(path.join(candidate, "apps/trenchclaw/package.json")) &&
      existsSync(path.join(candidate, "apps/frontends/gui"))
    ) {
      return candidate;
    }
  }

  return candidates[0] ?? process.cwd();
};

const APP_ROOT = resolveAppRoot();

const RUNTIME_HOST = process.env.RUNTIME_HOST || "127.0.0.1";
const DEFAULT_RUNTIME_PORT = Number.parseInt(process.env.RUNTIME_PORT || "4020", 10);
const DEFAULT_GUI_PORT = Number.parseInt(process.env.GUI_PORT || "4173", 10);
const SHUTDOWN_GRACE_MS = Number.parseInt(process.env.RELEASE_SHUTDOWN_GRACE_MS || "2500", 10);
// Bun currently enforces idleTimeout <= 255 seconds.
const GUI_IDLE_TIMEOUT_SECONDS = 255;

const ANSI = {
  reset: "\u001b[0m",
  neonTurquoise: "\u001b[38;2;0;245;212m",
  neonPurple: "\u001b[38;2;191;0;255m",
} as const;

const supportsColor = Boolean(process.stdout.isTTY) && !("NO_COLOR" in process.env);
const colorize = (value: string, color: keyof typeof ANSI): string =>
  supportsColor ? `${ANSI[color]}${value}${ANSI.reset}` : value;
const RUNNER_LOG_PREFIX = colorize("@trenchclaw:", "neonPurple");
const emphasize = (value: string): string => colorize(value, "neonTurquoise");

const GUI_DIST_DIR = path.join(APP_ROOT, "apps/frontends/gui/dist");
const GUI_INDEX_PATH = path.join(GUI_DIST_DIR, "index.html");

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

const waitForExitOrTimeout = async (proc: Bun.Subprocess, timeoutMs: number): Promise<boolean> =>
  await Promise.race([
    proc.exited.then(() => true),
    Bun.sleep(timeoutMs).then(() => false),
  ]);

interface BufferedLogRelay {
  write: (chunk: string) => void;
  setPassthrough: (enabled: boolean) => void;
}

const createBufferedLogRelay = (
  sink: NodeJS.WriteStream,
  maxBufferedLines = 500,
): BufferedLogRelay => {
  const buffer: string[] = [];
  let passthrough = false;

  const flush = (): void => {
    if (buffer.length === 0) {
      return;
    }
    sink.write(buffer.join(""));
    buffer.length = 0;
  };

  return {
    write: (chunk: string) => {
      if (passthrough) {
        sink.write(chunk);
        return;
      }
      buffer.push(chunk);
      if (buffer.length > maxBufferedLines) {
        buffer.splice(0, buffer.length - maxBufferedLines);
      }
    },
    setPassthrough: (enabled: boolean) => {
      passthrough = enabled;
      if (enabled) {
        flush();
      }
    },
  };
};

const relaySubprocessOutput = async (
  stream: ReadableStream<Uint8Array> | null,
  relay: BufferedLogRelay,
): Promise<void> => {
  if (!stream) {
    return;
  }

  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let pending = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) {
        relay.write(`${line}\n`);
      }
    }
    pending += decoder.decode();
    if (pending.length > 0) {
      relay.write(`${pending}\n`);
    }
  } finally {
    reader.releaseLock();
  }
};

const isSignalExitCode = (code: number): boolean => code === 130 || code === 143;

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

  console.warn(`${RUNNER_LOG_PREFIX} unable to auto-open browser. open manually: ${emphasize(url)}`);
};

const shouldPromptForGuiLaunch = (): boolean => {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return false;
  }

  const configured = process.env.TRENCHCLAW_RUNNER_PROMPT_GUI_LAUNCH?.trim().toLowerCase();
  if (!configured) {
    return true;
  }

  return !(configured === "0" || configured === "false" || configured === "no");
};

type GuiLaunchDecision = "launch" | "skip" | "quit";

const waitForGuiLaunchConfirmation = async (): Promise<GuiLaunchDecision> => {
  if (process.env.TRENCHCLAW_RUNNER_AUTO_OPEN_GUI === "1") {
    return "launch";
  }

  if (!shouldPromptForGuiLaunch()) {
    return "skip";
  }

  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = (
      await prompt.question(
        `${RUNNER_LOG_PREFIX} launch GUI now? Enter=yes, "skip"=CLI-only, "quit"=stop app: `,
      )
    )
      .trim()
      .toLowerCase();

    if (answer === "quit" || answer === "q" || answer === "exit") {
      return "quit";
    }
    if (answer === "skip" || answer === "s") {
      return "skip";
    }
    return "launch";
  } finally {
    prompt.close();
  }
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
  const sanitized = decoded.replace(/^\/+/, "");
  return path.normalize(path.join(GUI_DIST_DIR, sanitized));
};

const proxyApiRequest = async (request: Request, runtimeBaseUrl: string): Promise<Response> => {
  const url = new URL(request.url);
  const upstreamUrl = new URL(`${url.pathname}${url.search}`, runtimeBaseUrl);
  const proxyInit = {
    method: request.method,
    headers: request.headers,
    body: request.body,
    duplex: request.body ? "half" : undefined,
  };

  return fetch(upstreamUrl, proxyInit as unknown as RequestInit);
};

const createStaticServer = (input: {
  host: string;
  port: number;
  runtimeBaseUrl: string;
}): Bun.Server<unknown> => {
  return Bun.serve({
    hostname: input.host,
    port: input.port,
    idleTimeout: GUI_IDLE_TIMEOUT_SECONDS,
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
    throw new Error(`GUI build output not found at ${GUI_INDEX_PATH}. Run: bun run app:build`);
  }

  const runtimePort = await findAvailablePort(RUNTIME_HOST, DEFAULT_RUNTIME_PORT, "runtime");
  const guiPort =
    runtimePort === DEFAULT_GUI_PORT
      ? await findAvailablePort(RUNTIME_HOST, DEFAULT_GUI_PORT + 1, "gui")
      : await findAvailablePort(RUNTIME_HOST, DEFAULT_GUI_PORT, "gui");

  const runtimeUrl = `http://${RUNTIME_HOST}:${runtimePort}`;
  const guiUrl = `http://${RUNTIME_HOST}:${guiPort}`;

  console.log(`${RUNNER_LOG_PREFIX} runtime target: ${emphasize(runtimeUrl)}`);
  console.log(`${RUNNER_LOG_PREFIX} gui target: ${emphasize(guiUrl)}`);

  const runtimeProc = Bun.spawn([process.execPath, "src/runtime/start-runtime-server.ts"], {
    cwd: path.join(APP_ROOT, "apps/trenchclaw"),
    stdout: "pipe",
    stderr: "pipe",
    stdin: "inherit",
    env: {
      ...process.env,
      RUNTIME_HOST,
      RUNTIME_PORT: String(runtimePort),
      RUNTIME_REQUIRE_SERVER: "1",
      RUNTIME_STRICT_PORT: "1",
      TRENCHCLAW_GUI_URL: guiUrl,
      TRENCHCLAW_BOOT_REFRESH_CONTEXT: process.env.TRENCHCLAW_BOOT_REFRESH_CONTEXT ?? "0",
      TRENCHCLAW_BOOT_REFRESH_KNOWLEDGE: process.env.TRENCHCLAW_BOOT_REFRESH_KNOWLEDGE ?? "0",
    },
  });

  let guiServer: Bun.Server<unknown> | null = null;
  const runtimeStdoutRelay = createBufferedLogRelay(process.stdout);
  const runtimeStderrRelay = createBufferedLogRelay(process.stderr);
  const runtimeStdoutPump = relaySubprocessOutput(runtimeProc.stdout, runtimeStdoutRelay);
  const runtimeStderrPump = relaySubprocessOutput(runtimeProc.stderr, runtimeStderrRelay);
  let runtimeConsoleAttached = false;
  let shuttingDown = false;
  let shutdownRequested = false;
  let shutdownPromise: Promise<void> | null = null;

  const attachRuntimeConsole = (): void => {
    if (runtimeConsoleAttached) {
      return;
    }
    runtimeConsoleAttached = true;
    runtimeStdoutRelay.setPassthrough(true);
    runtimeStderrRelay.setPassthrough(true);
  };

  const shutdown = (exitCode: number): Promise<void> => {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shuttingDown = true;
    process.exitCode = shutdownRequested ? 0 : exitCode;

    shutdownPromise = (async () => {
      signalStop(runtimeProc);
      const exitedGracefully = await waitForExitOrTimeout(runtimeProc, SHUTDOWN_GRACE_MS);
      if (!exitedGracefully) {
        console.warn(
          `${RUNNER_LOG_PREFIX} runtime did not exit after ${emphasize(`${SHUTDOWN_GRACE_MS}ms`)}; force-killing`,
        );
        forceStop(runtimeProc);
        await waitForExitOrTimeout(runtimeProc, 1000);
      }

      guiServer?.stop(true);
    })();

    return shutdownPromise;
  };

  const handleTerminationSignal = (): void => {
    shutdownRequested = true;
    void shutdown(0);
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
    runtimeBaseUrl: runtimeUrl,
  });

  console.log(`${RUNNER_LOG_PREFIX} GUI serving from ${emphasize(guiUrl)}`);
  const guiLaunchDecision = await waitForGuiLaunchConfirmation();
  if (guiLaunchDecision === "quit") {
    console.log(`${RUNNER_LOG_PREFIX} shutdown requested before GUI launch.`);
    await shutdown(0);
    return;
  }
  if (guiLaunchDecision === "skip") {
    console.log(`${RUNNER_LOG_PREFIX} GUI auto-launch disabled. Runtime remains active.`);
    console.log(`${RUNNER_LOG_PREFIX} Open manually when needed: ${emphasize(guiUrl)}`);
  } else {
    await openBrowser(guiUrl);
  }
  console.log(`${RUNNER_LOG_PREFIX} Press ${emphasize("Ctrl+C")} to stop.`);
  attachRuntimeConsole();

  const runtimeExitCode = (await runtimeProc.exited) ?? 0;
  if (!runtimeConsoleAttached) {
    attachRuntimeConsole();
  }
  await Promise.all([runtimeStdoutPump, runtimeStderrPump]);
  if (runtimeExitCode !== 0 && !(shutdownRequested && isSignalExitCode(runtimeExitCode))) {
    console.error(`${RUNNER_LOG_PREFIX} runtime exited with code ${runtimeExitCode}`);
    await shutdown(runtimeExitCode);
    return;
  }

  await shutdown(0);
};

await main();
