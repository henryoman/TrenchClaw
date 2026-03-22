#!/usr/bin/env bun

import path from "node:path";
import { createServer } from "node:net";
import { initializeDeveloperRuntime, resolveDeveloperBootstrapRoots } from "./lib/dev-runtime";

const REPO_ROOT = process.cwd();
const RUNTIME_HOST = process.env.RUNTIME_HOST || "127.0.0.1";
const DEFAULT_RUNTIME_PORT = Number.parseInt(process.env.RUNTIME_PORT || "4020", 10);
const DEFAULT_FRONTEND_PORT = Number.parseInt(process.env.FRONTEND_PORT || process.env.GUI_PORT || "4173", 10);
const DEFAULT_FRONTEND_SURFACE = process.env.TRENCHCLAW_FRONTEND_SURFACE?.trim() || "gui";

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

interface CliArgs {
  runtimeRoot?: string;
  generatedRoot?: string;
  frontendSurface?: string;
}

const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--runtime-root":
        args.runtimeRoot = argv[index + 1];
        index += 1;
        break;
      case "--generated-root":
        args.generatedRoot = argv[index + 1];
        index += 1;
        break;
      case "--frontend-surface":
        args.frontendSurface = argv[index + 1];
        index += 1;
        break;
      case "--help":
      case "-h":
        console.log(
          [
            "Usage: bun run scripts/dev-bootstrap.ts [options]",
            "",
            "Options:",
            "  --runtime-root <path>     External runtime root for local dev",
            "  --generated-root <path>   External generated root for local dev",
            "  --frontend-surface <id>   Frontend surface under apps/frontends/",
          ].join("\n"),
        );
        process.exit(0);
        break;
      default:
        if (arg?.startsWith("--")) {
          throw new Error(`Unknown argument: ${arg}`);
        }
        break;
    }
  }

  return args;
};

const listPortOwnerPids = async (port: number): Promise<number[]> => {
  const proc = Bun.spawn(["lsof", "-ti", `tcp:${port}`], {
    cwd: REPO_ROOT,
    stdout: "pipe",
    stderr: "ignore",
  });
  const output = await new Response(proc.stdout).text();
  await proc.exited;
  return output
    .split(/\s+/u)
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value > 0);
};

const waitForPortToBecomeAvailable = async (host: string, port: number, attempts = 20, delayMs = 150): Promise<boolean> => {
  for (let index = 0; index < attempts; index += 1) {
    const probe = await canBindPort(host, port);
    if (probe.available) {
      return true;
    }
    await Bun.sleep(delayMs);
  }
  return false;
};

const reclaimPort = async (host: string, port: number, label: string): Promise<void> => {
  const probe = await canBindPort(host, port);
  if (probe.available) {
    return;
  }

  const ownerPids = await listPortOwnerPids(port);
  if (ownerPids.length === 0) {
    throw new Error(`Preferred ${label} port ${port} is in use and no owning process could be identified.`);
  }

  console.warn(`[bootstrap] reclaiming ${label} port ${port} from pid(s): ${ownerPids.join(", ")}`);
  for (const pid of ownerPids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Ignore races where the process exits before we signal it.
    }
  }

  if (await waitForPortToBecomeAvailable(host, port)) {
    return;
  }

  for (const pid of ownerPids) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Ignore races where the process exits before we signal it.
    }
  }

  if (await waitForPortToBecomeAvailable(host, port)) {
    return;
  }

  throw new Error(`Unable to reclaim ${label} port ${port}.`);
};

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

const resolveFrontendSurface = async (requestedSurface: string | undefined): Promise<{
  id: string;
  root: string;
}> => {
  const id = (requestedSurface?.trim() || DEFAULT_FRONTEND_SURFACE).trim();
  if (!id) {
    throw new Error("Frontend surface id must not be empty.");
  }

  const root = path.join(REPO_ROOT, "apps/frontends", id);
  const packageJsonPath = path.join(root, "package.json");
  if (!(await Bun.file(packageJsonPath).exists())) {
    throw new Error(`Frontend surface "${id}" not found at ${root}`);
  }

  return { id, root };
};

const run = async (): Promise<void> => {
  const cliArgs = parseArgs(process.argv.slice(2));
  const runtimeStrictPort = process.env.RUNTIME_STRICT_PORT === "1";
  const frontendStrictPort = process.env.FRONTEND_STRICT_PORT === "1" || process.env.GUI_STRICT_PORT === "1";
  const runtimePort = ensureValidPort(DEFAULT_RUNTIME_PORT, "runtime");
  const frontendPort = ensureValidPort(DEFAULT_FRONTEND_PORT, "frontend");
  const frontendSurface = await resolveFrontendSurface(cliArgs.frontendSurface);
  const runtimeUrl = `http://${RUNTIME_HOST}:${runtimePort}`;
  const frontendUrl = `http://${RUNTIME_HOST}:${frontendPort}`;

  if (runtimeStrictPort) {
    const runtimeProbe = await canBindPort(RUNTIME_HOST, runtimePort);
    if (!runtimeProbe.available) {
      throw new Error(`Runtime port ${runtimePort} is unavailable and strict mode is enabled.`);
    }
  } else {
    await reclaimPort(RUNTIME_HOST, runtimePort, "runtime");
  }

  if (frontendStrictPort) {
    const frontendProbe = await canBindPort(RUNTIME_HOST, frontendPort);
    if (!frontendProbe.available) {
      throw new Error(`Frontend port ${frontendPort} is unavailable and strict mode is enabled.`);
    }
  } else {
    await reclaimPort(RUNTIME_HOST, frontendPort, "frontend");
  }

  console.log(`[bootstrap] runtime target: ${runtimeUrl}`);
  console.log(`[bootstrap] frontend surface: ${frontendSurface.id}`);
  console.log(`[bootstrap] frontend target: ${frontendUrl}`);

  const baseEnv = { ...process.env };
  const { runtimeRoot: runtimeStateRoot, generatedRoot } = resolveDeveloperBootstrapRoots({
    runtimeRoot: cliArgs.runtimeRoot,
    generatedRoot: cliArgs.generatedRoot,
    env: baseEnv,
  });
  await initializeDeveloperRuntime({
    runtimeRoot: runtimeStateRoot,
    generatedRoot,
  });

  console.log(`[bootstrap] runtime state root: ${path.resolve(runtimeStateRoot)}`);
  console.log(`[bootstrap] generated root: ${path.resolve(generatedRoot)}`);

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
      TRENCHCLAW_APP_SURFACE: frontendSurface.id,
      TRENCHCLAW_APP_SURFACE_URL: frontendUrl,
      TRENCHCLAW_GUI_URL: frontendUrl,
      TRENCHCLAW_RUNTIME_STATE_ROOT: path.resolve(runtimeStateRoot),
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
        { label: "frontend", proc: guiProc },
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

  console.log("[bootstrap] runtime spawned; starting frontend surface");

  guiProc = Bun.spawn(["bun", "--bun", "vite", "--host", RUNTIME_HOST, "--port", String(frontendPort), "--strictPort"], {
    cwd: frontendSurface.root,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env: {
      ...baseEnv,
      FRONTEND_PORT: String(frontendPort),
      TRENCHCLAW_FRONTEND_SURFACE: frontendSurface.id,
      VITE_TRENCHCLAW_RUNTIME_URL: runtimeUrl,
    },
  });

  const runtimeExit = waitForExit(runtimeProc);
  const guiExit = waitForExit(guiProc);

  const result = await Promise.race([
    runtimeExit.then((code) => ({ source: "runtime" as const, code })),
    guiExit.then((code) => ({ source: "frontend" as const, code })),
  ]);

  if (result.code !== 0 && !(shutdownRequested && isSignalExitCode(result.code))) {
    console.error(`[bootstrap] ${result.source} exited with code ${result.code}`);
    await shutdown(result.code);
    return;
  }

  await shutdown(0);
};

await run();
