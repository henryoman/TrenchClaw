import { renderWelcomeToTrenchClaw } from "./views/welcome";
import { bootstrapRuntime, type RuntimeBootstrap } from "../../runtime/bootstrap";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { mkdir, readdir } from "node:fs/promises";
import { createWebGuiApiHandler } from "./web-gui";

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

interface WebGuiServerInfo {
  host: string;
  port: number;
  url: string;
  process: Bun.Subprocess<"ignore", "ignore", "pipe">;
}

interface CliLaunchPreferences {
  operatorAlias: string;
  launchWebGui: boolean;
  autoOpenWebGui: boolean;
  webGuiHost: string;
  webGuiPort: number;
}

const RUNTIME_PROFILE_OPTIONS: Array<{ id: string; profile: RuntimeSafetyProfile; label: string }> = [
  { id: "1", profile: "safe", label: "Safe (read-mostly / guarded)" },
  { id: "2", profile: "dangerous", label: "Dangerous (recommended, confirm before risky actions)" },
  { id: "3", profile: "veryDangerous", label: "Very Dangerous (no confirmation gate)" },
];
const DEFAULT_RUNTIME_PROFILE: RuntimeSafetyProfile = "dangerous";
const DEFAULT_INSTANCE_NAME = "trenchclaw-instance";
const PROFILES_DIRECTORY = path.join(process.cwd(), "src/ai/brain/protected/system-settings/profiles");

interface InstanceProfileWriteResult {
  filePath: string;
  instanceName: string;
  localInstanceId: string;
}

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

const toWebGuiPort = (value: string | undefined): number => {
  if (!value) {
    return 4173;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    return 4173;
  }

  return parsed;
};

export const startRuntimeServer = (
  runtime: RuntimeBootstrap,
): RuntimeServerInfo => {
  const host = process.env.RUNTIME_HOST ?? "127.0.0.1";
  const port = toPortNumber(process.env.RUNTIME_PORT);
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

const installShutdownHooks = (runtime: RuntimeBootstrap, webGui?: WebGuiServerInfo): void => {
  const shutdown = (signal: string) => {
    if (webGui) {
      webGui.process.kill();
    }
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

  let launchPreferences: CliLaunchPreferences = {
    operatorAlias: process.env.TRENCHCLAW_OPERATOR_ALIAS?.trim() || "operator",
    launchWebGui: process.env.TRENCHCLAW_WEB_GUI !== "0",
    autoOpenWebGui: process.env.TRENCHCLAW_WEB_GUI_AUTO_OPEN !== "0",
    webGuiHost: process.env.TRENCHCLAW_WEB_GUI_HOST?.trim() || "127.0.0.1",
    webGuiPort: toWebGuiPort(process.env.TRENCHCLAW_WEB_GUI_PORT),
  };

  if (parsedArgs.mode !== "headless") {
    const selectedProfile = await promptRuntimeProfile();
    process.env.TRENCHCLAW_PROFILE = selectedProfile;
    const instanceProfile = await promptAndCreateInstanceProfile({
      selectedProfile,
      defaultInstanceName: launchPreferences.operatorAlias,
    });
    launchPreferences = {
      ...launchPreferences,
      operatorAlias: instanceProfile.instanceName,
    };
    console.log(
      `[profile] created instance "${instanceProfile.instanceName}" (${instanceProfile.localInstanceId}) -> ${instanceProfile.filePath}`,
    );
    launchPreferences = await promptCliLaunchPreferences(launchPreferences);
  } else {
    launchPreferences = {
      ...launchPreferences,
      launchWebGui: false,
      autoOpenWebGui: false,
    };
  }

  const runtime = await bootstrapRuntime();
  let serverInfo: RuntimeServerInfo | null = null;
  let webGuiServer: WebGuiServerInfo | null = null;
  try {
    serverInfo = startRuntimeServer(runtime);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[runtime] failed to start HTTP server: ${message}`);
  }

  if (launchPreferences.launchWebGui && serverInfo) {
    webGuiServer = await startWebGuiServer({
      host: launchPreferences.webGuiHost,
      port: launchPreferences.webGuiPort,
      runtimeUrl: serverInfo.url,
      operatorAlias: launchPreferences.operatorAlias,
    });
  }

  installShutdownHooks(runtime, webGuiServer ?? undefined);

  if (parsedArgs.mode === "dev") {
    runtime.enqueueJob({
      botId: "dev-bootstrap",
      routineName: "createWallets",
      config: {},
    });
  }

  renderWelcomeToTrenchClaw({
    runtimeServerUrl: serverInfo?.url,
    webGuiUrl: webGuiServer?.url,
  });
  console.log("[runtime] booted", JSON.stringify(runtime.describe()));
  if (webGuiServer) {
    console.log(`[gui] open: ${webGuiServer.url}`);
    if (launchPreferences.autoOpenWebGui) {
      void openUrlInBrowser(webGuiServer.url);
    }
  }

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

async function promptCliLaunchPreferences(defaults: CliLaunchPreferences): Promise<CliLaunchPreferences> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return defaults;
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const launchGuiInput = (await rl.question(`Launch web GUI? [Y/n] (default: ${defaults.launchWebGui ? "Y" : "N"}): `))
      .trim()
      .toLowerCase();
    const launchWebGui = parseYesNoInput(launchGuiInput, defaults.launchWebGui);

    const autoOpenInput = launchWebGui
      ? (await rl.question(`Auto-open browser? [Y/n] (default: ${defaults.autoOpenWebGui ? "Y" : "N"}): `))
        .trim()
        .toLowerCase()
      : "";
    const autoOpenWebGui = launchWebGui
      ? parseYesNoInput(autoOpenInput, defaults.autoOpenWebGui)
      : false;

    const portInput = launchWebGui
      ? (await rl.question(`Web GUI port (default: ${defaults.webGuiPort}): `)).trim()
      : "";
    const parsedPort = Number(portInput);
    const webGuiPort = portInput && Number.isInteger(parsedPort) && parsedPort > 0
      ? parsedPort
      : defaults.webGuiPort;

    return {
      operatorAlias: defaults.operatorAlias,
      launchWebGui,
      autoOpenWebGui,
      webGuiHost: defaults.webGuiHost,
      webGuiPort,
    };
  } finally {
    rl.close();
  }
}

async function promptAndCreateInstanceProfile(input: {
  selectedProfile: RuntimeSafetyProfile;
  defaultInstanceName: string;
}): Promise<InstanceProfileWriteResult> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    const fallbackName = input.defaultInstanceName || DEFAULT_INSTANCE_NAME;
    return writeInstanceProfile({
      instanceName: fallbackName,
      safetyProfile: input.selectedProfile,
      userPin: null,
    });
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const nameInput = (
      await rl.question(`Instance name (default: ${input.defaultInstanceName || DEFAULT_INSTANCE_NAME}): `)
    ).trim();
    const instanceName = nameInput || input.defaultInstanceName || DEFAULT_INSTANCE_NAME;

    const pinInput = (await rl.question("Optional user PIN (Enter to skip): ")).trim();
    const userPin = pinInput.length > 0 ? pinInput : null;

    return writeInstanceProfile({
      instanceName,
      safetyProfile: input.selectedProfile,
      userPin,
    });
  } finally {
    rl.close();
  }
}

async function writeInstanceProfile(input: {
  instanceName: string;
  safetyProfile: RuntimeSafetyProfile;
  userPin: string | null;
}): Promise<InstanceProfileWriteResult> {
  await mkdir(PROFILES_DIRECTORY, { recursive: true });

  const entries = await readdir(PROFILES_DIRECTORY, { withFileTypes: true });
  const profileNumbers = entries
    .filter((entry) => entry.isFile())
    .map((entry) => /^user-(\d+)\.json$/u.exec(entry.name)?.[1])
    .filter((value): value is string => value != null)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  const nextProfileNumber = profileNumbers.length > 0 ? Math.max(...profileNumbers) + 1 : 1;
  const localInstanceId = String(nextProfileNumber).padStart(4, "0");
  const filePath = path.join(PROFILES_DIRECTORY, `user-${nextProfileNumber}.json`);
  const nowIso = new Date().toISOString();

  const document = {
    instance: {
      name: input.instanceName,
      localInstanceId,
      userPin: input.userPin,
    },
    runtime: {
      safetyProfile: input.safetyProfile,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  };

  await Bun.write(filePath, `${JSON.stringify(document, null, 2)}\n`);

  return {
    filePath,
    instanceName: input.instanceName,
    localInstanceId,
  };
}

function parseYesNoInput(rawInput: string, defaultValue: boolean): boolean {
  if (!rawInput) {
    return defaultValue;
  }

  if (rawInput === "y" || rawInput === "yes") {
    return true;
  }

  if (rawInput === "n" || rawInput === "no") {
    return false;
  }

  return defaultValue;
}

async function openUrlInBrowser(url: string): Promise<void> {
  try {
    if (process.platform === "darwin") {
      const subprocess = Bun.spawn({
        cmd: ["open", url],
        stdout: "ignore",
        stderr: "ignore",
      });
      subprocess.unref();
      return;
    }

    if (process.platform === "win32") {
      const subprocess = Bun.spawn({
        cmd: ["cmd", "/c", "start", "", url],
        stdout: "ignore",
        stderr: "ignore",
      });
      subprocess.unref();
      return;
    }

    const subprocess = Bun.spawn({
      cmd: ["xdg-open", url],
      stdout: "ignore",
      stderr: "ignore",
    });
    subprocess.unref();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[gui] unable to auto-open browser: ${message}`);
  }
}

async function startWebGuiServer(input: {
  host: string;
  port: number;
  runtimeUrl: string;
  operatorAlias: string;
}): Promise<WebGuiServerInfo | null> {
  const webGuiDirectory = path.join(process.cwd(), "src/apps/web-gui");
  const subprocess = Bun.spawn({
    cmd: ["bun", "run", "dev", "--host", input.host, "--port", String(input.port), "--strictPort"],
    cwd: webGuiDirectory,
    env: {
      ...process.env,
      TRENCHCLAW_RUNTIME_URL: input.runtimeUrl,
      VITE_OPERATOR_ALIAS: input.operatorAlias,
    },
    stdout: "ignore",
    stdin: "ignore",
    stderr: "pipe",
  });

  const exitedQuickly = await Promise.race([
    subprocess.exited.then(() => true),
    Bun.sleep(350).then(() => false),
  ]);

  if (exitedQuickly) {
    const errorOutput = await new Response(subprocess.stderr).text();
    console.warn(`[gui] failed to start Svelte dev server: ${errorOutput.trim() || "unknown error"}`);
    return null;
  }

  const url = `http://${input.host}:${input.port}`;
  const ready = await waitForHttpReady(url, 10_000);
  if (!ready) {
    console.warn(`[gui] server started but did not respond within timeout: ${url}`);
  }

  return {
    host: input.host,
    port: input.port,
    url,
    process: subprocess,
  };
}

async function waitForHttpReady(url: string, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return true;
      }
    } catch {
      // ignored: server not ready yet
    }

    await Bun.sleep(200);
  }

  return false;
}

if (import.meta.main) {
  await startCli(Bun.argv);
}
