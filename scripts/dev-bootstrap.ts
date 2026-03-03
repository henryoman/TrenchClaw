#!/usr/bin/env bun

import path from "node:path";
import { createServer } from "node:net";

const REPO_ROOT = process.cwd();
const RUNTIME_HOST = process.env.RUNTIME_HOST || "127.0.0.1";
const DEFAULT_RUNTIME_PORT = Number.parseInt(process.env.RUNTIME_PORT || "4020", 10);
const DEFAULT_GUI_PORT = Number.parseInt(process.env.GUI_PORT || "4173", 10);

const isValidPort = (value: number): boolean => Number.isInteger(value) && value > 0 && value <= 65535;

const ensureValidPort = (value: number, label: string): number => {
  if (!isValidPort(value)) {
    throw new Error(`Invalid ${label} port: ${value}`);
  }
  return value;
};

interface PortProbeResult {
  available: boolean;
  errorCode?: string;
}

const canBindPort = (host: string, port: number): Promise<PortProbeResult> =>
  new Promise((resolve) => {
    const server = createServer();

    server.once("error", (error: NodeJS.ErrnoException) => {
      resolve({
        available: false,
        errorCode: error.code,
      });
    });

    server.listen({ host, port }, () => {
      server.close(() => {
        resolve({ available: true });
      });
    });
  });

const findAvailablePort = async (host: string, preferredPort: number, label: string): Promise<number> => {
  const firstPort = ensureValidPort(preferredPort, label);
  const maxPort = Math.min(65535, firstPort + 200);

  for (let port = firstPort; port <= maxPort; port += 1) {
    const probe = await canBindPort(host, port);
    if (probe.available) {
      return port;
    }

    if (probe.errorCode === "EACCES" || probe.errorCode === "EPERM") {
      throw new Error(`Port probe blocked by OS permissions (${probe.errorCode}) on ${host}:${port}`);
    }
  }

  throw new Error(`No available ${label} port found from ${firstPort} to ${maxPort} (${maxPort - firstPort + 1} attempts)`);
};

const waitForExit = async (proc: Bun.Subprocess): Promise<number> => {
  const code = await proc.exited;
  return code ?? 0;
};

const waitForExitOrTimeout = async (proc: Bun.Subprocess, timeoutMs: number): Promise<boolean> =>
  await Promise.race([
    proc.exited.then(() => true),
    Bun.sleep(timeoutMs).then(() => false),
  ]);

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

  const runtimeProc = Bun.spawn(["bun", "run", "--cwd", "apps/trenchclaw", "runtime:start"], {
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
  let shutdownRequested = false;
  let shutdownPromise: Promise<void> | null = null;
  const shutdownGraceMs = Number.parseInt(process.env.BOOTSTRAP_SHUTDOWN_GRACE_MS || "2500", 10);

  const shutdown = (exitCode: number): Promise<void> => {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shuttingDown = true;
    process.exitCode = shutdownRequested ? 0 : exitCode;

    shutdownPromise = (async () => {
      const procs: Array<{ label: string; proc: Bun.Subprocess | null }> = [
        { label: "runtime", proc: runtimeProc },
        { label: "gui", proc: guiProc },
      ];

      for (const item of procs) {
        if (!item.proc) {
          continue;
        }
        signalStop(item.proc);
      }

      for (const item of procs) {
        if (!item.proc) {
          continue;
        }

        const exitedGracefully = await waitForExitOrTimeout(item.proc, shutdownGraceMs);
        if (exitedGracefully) {
          continue;
        }

        console.warn(`[bootstrap] ${item.label} did not exit after ${shutdownGraceMs}ms; force-killing`);
        forceStop(item.proc);
        await waitForExitOrTimeout(item.proc, 1000);
      }
    })();

    return shutdownPromise;
  };

  const handleFatal = (label: string, error: unknown): void => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[bootstrap] ${label}: ${message}`);
    void shutdown(1);
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
      if (guiProc) {
        signalStop(guiProc);
      }
    }
  });
  process.once("uncaughtException", (error) => {
    handleFatal("uncaught exception", error);
  });
  process.once("unhandledRejection", (reason) => {
    handleFatal("unhandled rejection", reason);
  });

  console.log("[bootstrap] runtime spawned; starting GUI");

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

  if (result.code !== 0 && !(shutdownRequested && isSignalExitCode(result.code))) {
    console.error(`[bootstrap] ${result.source} exited with code ${result.code}`);
    await shutdown(result.code);
    return;
  }

  await shutdown(0);
};

await run();
