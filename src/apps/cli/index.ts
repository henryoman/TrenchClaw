import { renderWelcomeToTrenchClaw } from "./views/welcome";
import { bootstrapRuntime, type RuntimeBootstrap } from "../../runtime/bootstrap";
import { createInterface } from "node:readline/promises";

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

const RUNTIME_PROFILE_OPTIONS: Array<{ id: string; profile: RuntimeSafetyProfile; label: string }> = [
  { id: "1", profile: "safe", label: "Safe (read-mostly / guarded)" },
  { id: "2", profile: "dangerous", label: "Dangerous (confirm before risky actions)" },
  { id: "3", profile: "veryDangerous", label: "Very Dangerous (no confirmation gate)" },
];
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
  const createServer = (targetPort: number) =>
    Bun.serve({
      hostname: host,
      port: targetPort,
      routes: {
        "/health": () =>
          Response.json({
            ok: true,
            service: "trenchclaw-runtime",
            profile: runtime.settings.profile,
          }),
        "/": () =>
          Response.json({
            service: "trenchclaw-runtime",
            status: "running",
            runtime: runtime.describe(),
          }),
      },
      fetch: () => new Response("Not Found", { status: 404 }),
    });

  const server = (() => {
    try {
      return createServer(port);
    } catch (error) {
      const isAddrInUse =
        error instanceof Error && "code" in error && (error as { code?: string }).code === "EADDRINUSE";
      if (!isAddrInUse) {
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

  if (parsedArgs.mode !== "headless") {
    const selectedProfile = await promptRuntimeProfile();
    process.env.TRENCHCLAW_PROFILE = selectedProfile;
  }

  const runtime = await bootstrapRuntime();
  let serverInfo: RuntimeServerInfo | null = null;
  try {
    serverInfo = startRuntimeServer(runtime);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[runtime] failed to start HTTP server: ${message}`);
  }
  installShutdownHooks(runtime);

  if (parsedArgs.mode === "dev") {
    runtime.enqueueJob({
      botId: "dev-bootstrap",
      routineName: "createWallets",
      config: {},
    });
  }

  renderWelcomeToTrenchClaw({ runtimeServerUrl: serverInfo?.url });
  console.log("[runtime] booted", JSON.stringify(runtime.describe()));

  return parsedArgs;
};

export * from "./views";

async function promptRuntimeProfile(): Promise<RuntimeSafetyProfile> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return process.env.TRENCHCLAW_PROFILE === "safe" ||
      process.env.TRENCHCLAW_PROFILE === "dangerous" ||
      process.env.TRENCHCLAW_PROFILE === "veryDangerous"
      ? process.env.TRENCHCLAW_PROFILE
      : DEFAULT_RUNTIME_PROFILE;
  }

  const existing = process.env.TRENCHCLAW_PROFILE;
  const currentDefault =
    existing === "safe" || existing === "dangerous" || existing === "veryDangerous"
      ? existing
      : DEFAULT_RUNTIME_PROFILE;

  process.stdout.write("\nSelect runtime mode:\n");
  for (const option of RUNTIME_PROFILE_OPTIONS) {
    const defaultMarker = option.profile === currentDefault ? " (default)" : "";
    process.stdout.write(`  ${option.id}) ${option.label}${defaultMarker}\n`);
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    while (true) {
      const raw = (await rl.question("Choose mode [1-3] (Enter for default): ")).trim();
      if (!raw) {
        return currentDefault;
      }

      const byId = RUNTIME_PROFILE_OPTIONS.find((option) => option.id === raw);
      if (byId) {
        return byId.profile;
      }

      const normalized = raw.toLowerCase();
      const byName = RUNTIME_PROFILE_OPTIONS.find((option) => option.profile.toLowerCase() === normalized);
      if (byName) {
        return byName.profile;
      }

      process.stdout.write('Invalid selection. Enter 1, 2, 3, "safe", "dangerous", or "veryDangerous".\n');
    }
  } finally {
    rl.close();
  }
}

if (import.meta.main) {
  await startCli(Bun.argv);
}
