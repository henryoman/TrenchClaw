#!/usr/bin/env bun

import path from "node:path";
import { createServer } from "node:net";

const REPO_ROOT = process.cwd();
const RUNTIME_HOST = process.env.RUNTIME_HOST || "127.0.0.1";
const DEFAULT_RUNTIME_PORT = Number.parseInt(process.env.RUNTIME_PORT || "4020", 10);
const DEFAULT_GUI_PORT = Number.parseInt(process.env.GUI_PORT || "4173", 10);
const HEALTH_TIMEOUT_MS = Number.parseInt(process.env.BOOTSTRAP_HEALTH_TIMEOUT_MS || "30000", 10);
const HEALTH_POLL_MS = 250;

const isValidPort = (value: number): boolean => Number.isInteger(value) && value > 0 && value <= 65535;

const ensureValidPort = (value: number, label: string): number => {
  if (!isValidPort(value)) {
    throw new Error(`Invalid ${label} port: ${value}`);
  }
  return value;
};

const canBindPort = (host: string, port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const server = createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.listen({ host, port }, () => {
      server.close(() => {
        resolve(true);
      });
    });
  });

const findAvailablePort = async (host: string, preferredPort: number, label: string): Promise<number> => {
  const firstPort = ensureValidPort(preferredPort, label);
  const maxPort = 65535;

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
      // Runtime is still booting.
    }
    await Bun.sleep(HEALTH_POLL_MS);
  }

  throw new Error(`Runtime health check timed out after ${timeoutMs}ms (${healthUrl})`);
};

const waitForExit = async (proc: Bun.Subprocess): Promise<number> => {
  const code = await proc.exited;
  return code ?? 0;
};

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

const run = async (): Promise<void> => {
  const runtimeStrictPort = process.env.RUNTIME_STRICT_PORT === "1";
  const guiStrictPort = process.env.GUI_STRICT_PORT === "1";

  const runtimePort = runtimeStrictPort
    ? ensureValidPort(DEFAULT_RUNTIME_PORT, "runtime")
    : await findAvailablePort(RUNTIME_HOST, DEFAULT_RUNTIME_PORT, "runtime");

  const initialGuiPort = guiStrictPort
    ? ensureValidPort(DEFAULT_GUI_PORT, "gui")
    : await findAvailablePort(RUNTIME_HOST, DEFAULT_GUI_PORT, "gui");

  const guiPort =
    initialGuiPort === runtimePort ? await findAvailablePort(RUNTIME_HOST, initialGuiPort + 1, "gui") : initialGuiPort;
  const runtimeUrl = `http://${RUNTIME_HOST}:${runtimePort}`;
  const guiUrl = `http://${RUNTIME_HOST}:${guiPort}`;

  if (runtimePort !== DEFAULT_RUNTIME_PORT) {
    console.log(`[bootstrap] runtime port ${DEFAULT_RUNTIME_PORT} unavailable; using ${runtimePort}`);
  }

  if (guiPort !== DEFAULT_GUI_PORT) {
    console.log(`[bootstrap] gui port ${DEFAULT_GUI_PORT} unavailable; using ${guiPort}`);
  }

  console.log(`[bootstrap] runtime target: ${runtimeUrl}`);
  console.log(`[bootstrap] gui target: ${guiUrl}`);

  const baseEnv = { ...process.env };

  const runtimeProc = Bun.spawn(["bun", "run", "--cwd", "apps/frontends/cli", "dev"], {
    cwd: REPO_ROOT,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env: {
      ...baseEnv,
      RUNTIME_HOST,
      RUNTIME_PORT: String(runtimePort),
      RUNTIME_REQUIRE_SERVER: "1",
      TRENCHCLAW_GUI_URL: guiUrl,
    },
  });

  let guiProc: Bun.Subprocess | null = null;
  let shuttingDown = false;

  const shutdown = (exitCode: number): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    signalStop(runtimeProc);
    if (guiProc) {
      signalStop(guiProc);
    }

    setTimeout(() => {
      forceStop(runtimeProc);
      if (guiProc) {
        forceStop(guiProc);
      }
    }, 1500).unref();

    setTimeout(() => {
      process.exit(exitCode);
    }, 1600).unref();
  };

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));

  try {
    await Promise.race([
      waitForRuntimeHealth(runtimeUrl, HEALTH_TIMEOUT_MS),
      runtimeProc.exited.then((code) => {
        throw new Error(`Runtime exited before becoming healthy (code ${code ?? 0})`);
      }),
    ]);
    console.log("[bootstrap] runtime healthy; starting GUI");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[bootstrap] ${message}`);
    shutdown(1);
    return;
  }

  guiProc = Bun.spawn(["bun", "--bun", "vite", "--host", RUNTIME_HOST, "--port", String(guiPort), "--strictPort"], {
    cwd: path.join(REPO_ROOT, "apps/frontends/gui"),
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env: {
      ...baseEnv,
      VITE_TRENCHCLAW_RUNTIME_URL: runtimeUrl,
    },
  });

  const runtimeExit = waitForExit(runtimeProc);
  const guiExit = waitForExit(guiProc);

  const result = await Promise.race([
    runtimeExit.then((code) => ({ source: "runtime" as const, code })),
    guiExit.then((code) => ({ source: "gui" as const, code })),
  ]);

  if (result.code !== 0) {
    console.error(`[bootstrap] ${result.source} exited with code ${result.code}`);
    shutdown(result.code);
    return;
  }

  shutdown(0);
};

await run();
