import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";

import type { bootstrapRuntime as bootstrapRuntimeType } from "../trenchclaw/src/runtime/bootstrap";
import type { RuntimeSettingsProfile } from "../trenchclaw/src/runtime/load";
import type { startRuntimeServer as startRuntimeServerType, RuntimeServerInfo } from "../trenchclaw/src/runtime/start-runtime-server";

const RUNTIME_HOST = process.env.RUNTIME_HOST || "127.0.0.1";
const DEFAULT_RUNTIME_PORT = Number.parseInt(process.env.RUNTIME_PORT || "4020", 10);
const DEFAULT_GUI_PORT = Number.parseInt(process.env.GUI_PORT || "4173", 10);
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

type LayoutKind = "workspace" | "release";

interface ResolvedLayout {
  kind: LayoutKind;
  root: string;
  guiDistDir: string;
  guiIndexPath: string;
  coreAssetRoot: string;
  runtimeStateRoot: string;
}

const normalizeConfiguredPath = (value: string): string =>
  path.isAbsolute(value) ? path.resolve(value) : path.resolve(process.cwd(), value);

const isWorkspaceRoot = (candidate: string): boolean =>
  existsSync(path.join(candidate, "apps/trenchclaw/package.json")) &&
  existsSync(path.join(candidate, "apps/frontends/gui"));

const isReleaseRoot = (candidate: string): boolean =>
  existsSync(path.join(candidate, "core", "src", "ai", "brain")) &&
  existsSync(path.join(candidate, "gui", "index.html"));

const resolveDefaultRuntimeStateRoot = (): string =>
  path.join(process.env.HOME || process.env.USERPROFILE || process.cwd(), ".trenchclaw");

const resolveRuntimeStateRoot = (kind: LayoutKind, coreAssetRoot: string): string => {
  const configured = process.env.TRENCHCLAW_RUNTIME_STATE_ROOT?.trim();
  if (configured) {
    return normalizeConfiguredPath(configured);
  }

  if (kind === "workspace") {
    return path.join(coreAssetRoot, ".runtime-state");
  }

  return resolveDefaultRuntimeStateRoot();
};

const resolveLayout = (): ResolvedLayout => {
  const envReleaseRoot = process.env.TRENCHCLAW_RELEASE_ROOT?.trim();
  const candidates = [
    envReleaseRoot ? normalizeConfiguredPath(envReleaseRoot) : null,
    path.dirname(process.execPath),
    path.resolve(import.meta.dir, "../.."),
    path.resolve(import.meta.dir, "../../.."),
    process.cwd(),
  ].filter((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0);

  for (const candidate of candidates) {
    if (isReleaseRoot(candidate)) {
      const guiDistDir = path.join(candidate, "gui");
      return {
        kind: "release",
        root: candidate,
        guiDistDir,
        guiIndexPath: path.join(guiDistDir, "index.html"),
        coreAssetRoot: path.join(candidate, "core"),
        runtimeStateRoot: resolveRuntimeStateRoot("release", path.join(candidate, "core")),
      };
    }
    if (isWorkspaceRoot(candidate)) {
      const guiDistDir = path.join(candidate, "apps/frontends/gui/dist");
      const coreAssetRoot = path.join(candidate, "apps/trenchclaw");
      return {
        kind: "workspace",
        root: candidate,
        guiDistDir,
        guiIndexPath: path.join(guiDistDir, "index.html"),
        coreAssetRoot,
        runtimeStateRoot: resolveRuntimeStateRoot("workspace", coreAssetRoot),
      };
    }
  }

  throw new Error(
    `Unable to resolve TrenchClaw layout. Checked: ${candidates.join(", ")}. Set TRENCHCLAW_RELEASE_ROOT if launching a packaged release.`,
  );
};

const LAYOUT = resolveLayout();

let runtimeImportsPromise: Promise<{
  bootstrapRuntime: typeof bootstrapRuntimeType;
  resolveRuntimeSettingsProfile: () => RuntimeSettingsProfile;
  startRuntimeServer: typeof startRuntimeServerType;
}> | null = null;

const loadRuntimeImports = async (): Promise<{
  bootstrapRuntime: typeof bootstrapRuntimeType;
  resolveRuntimeSettingsProfile: () => RuntimeSettingsProfile;
  startRuntimeServer: typeof startRuntimeServerType;
}> => {
  if (!runtimeImportsPromise) {
    runtimeImportsPromise = Promise.all([
      import("../trenchclaw/src/runtime/bootstrap"),
      import("../trenchclaw/src/runtime/load"),
      import("../trenchclaw/src/runtime/start-runtime-server"),
    ]).then(([bootstrapModule, loadModule, serverModule]) => ({
      bootstrapRuntime: bootstrapModule.bootstrapRuntime,
      resolveRuntimeSettingsProfile: loadModule.resolveRuntimeSettingsProfile,
      startRuntimeServer: serverModule.startRuntimeServer,
    }));
  }
  return runtimeImportsPromise;
};

const resolveBinaryVersion = (): string => {
  const configuredVersion = process.env.TRENCHCLAW_BUILD_VERSION?.trim();
  if (configuredVersion) {
    return configuredVersion;
  }

  const metadataFiles = [
    path.join(LAYOUT.root, "release-metadata.json"),
    path.join(LAYOUT.root, "build-metadata.json"),
    path.join(LAYOUT.root, "package.json"),
  ];
  for (const candidate of metadataFiles) {
    if (!existsSync(candidate)) {
      continue;
    }
    try {
      const parsed = JSON.parse(readFileSync(candidate, "utf8")) as { version?: unknown };
      if (typeof parsed.version === "string" && parsed.version.trim().length > 0) {
        return parsed.version.trim();
      }
    } catch {
      // Try next file.
    }
  }

  return "unknown";
};

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
  const tryPort = async (port: number): Promise<number> => {
    if (port > maxPort) {
      throw new Error(`No available ${label} port found from ${firstPort} to ${maxPort}`);
    }
    if (await canBindPort(host, port)) {
      return port;
    }
    return tryPort(port + 1);
  };

  return tryPort(firstPort);
};

const openBrowser = async (url: string): Promise<void> => {
  const commands = process.platform === "darwin" ? [["open", url]] : [["xdg-open", url]];
  const tryCommand = async (index: number): Promise<void> => {
    const command = commands[index];
    if (!command) {
      console.warn(`${RUNNER_LOG_PREFIX} unable to auto-open browser. open manually: ${emphasize(url)}`);
      return;
    }

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

    await tryCommand(index + 1);
  };

  await tryCommand(0);
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
  if (process.env.TRENCHCLAW_RUNNER_SMOKE_TEST === "1") {
    return "skip";
  }

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
        `${RUNNER_LOG_PREFIX} launch GUI now? Enter=yes, "skip"=not now, "quit"=stop app: `,
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
  return path.normalize(path.join(LAYOUT.guiDistDir, sanitized));
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
        if (!targetPath.startsWith(LAYOUT.guiDistDir) || !existsSync(targetPath)) {
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

      return new Response(Bun.file(LAYOUT.guiIndexPath), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    },
  });
};

const copyFileIfMissing = (source: string, target: string): void => {
  if (!existsSync(source) || existsSync(target)) {
    return;
  }
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, readFileSync(source));
};

const writeFileIfMissing = (target: string, contents: string): void => {
  if (existsSync(target)) {
    return;
  }
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents, "utf8");
};

const ensureRuntimeStateLayout = (): void => {
  const directories = [
    path.join(LAYOUT.runtimeStateRoot, "db"),
    path.join(LAYOUT.runtimeStateRoot, "db/events"),
    path.join(LAYOUT.runtimeStateRoot, "db/sessions"),
    path.join(LAYOUT.runtimeStateRoot, "db/memory"),
    path.join(LAYOUT.runtimeStateRoot, "user"),
    path.join(LAYOUT.runtimeStateRoot, "user/workspace"),
    path.join(LAYOUT.runtimeStateRoot, "user/workspace/routines"),
    path.join(LAYOUT.runtimeStateRoot, "instances"),
    path.join(LAYOUT.runtimeStateRoot, "generated"),
    path.join(LAYOUT.runtimeStateRoot, "protected/keypairs"),
  ];

  for (const directory of directories) {
    mkdirSync(directory, { recursive: true });
  }

  const placeholders: Array<{ source: string; target: string }> = [
    {
      source: path.join(LAYOUT.coreAssetRoot, "src/ai/config/vault.template.json"),
      target: path.join(LAYOUT.runtimeStateRoot, "user/vault.template.json"),
    },
    {
      source: path.join(LAYOUT.coreAssetRoot, "src/ai/brain/protected/keypairs/.keep"),
      target: path.join(LAYOUT.runtimeStateRoot, "protected/keypairs/.keep"),
    },
  ];

  for (const placeholder of placeholders) {
    copyFileIfMissing(placeholder.source, placeholder.target);
  }

  writeFileIfMissing(path.join(LAYOUT.runtimeStateRoot, "user/settings.json"), "{}\n");
};

const toSettingsFileName = (profile: RuntimeSettingsProfile): string =>
  profile === "veryDangerous" ? "veryDangerous.json" : `${profile}.json`;

const configureRuntimeEnvironment = async (runtimePort: number, guiUrl: string): Promise<void> => {
  const { resolveRuntimeSettingsProfile } = await loadRuntimeImports();
  const profile = resolveRuntimeSettingsProfile();
  const bundledBrainRoot = path.join(LAYOUT.coreAssetRoot, "src/ai/brain");

  process.env.RUNTIME_HOST = RUNTIME_HOST;
  process.env.RUNTIME_PORT = String(runtimePort);
  process.env.RUNTIME_STRICT_PORT = "1";
  process.env.RUNTIME_REQUIRE_SERVER = "1";
  process.env.TRENCHCLAW_GUI_URL = guiUrl;
  process.env.TRENCHCLAW_RELEASE_ROOT = LAYOUT.root;
  process.env.TRENCHCLAW_APP_ROOT = LAYOUT.coreAssetRoot;
  process.env.TRENCHCLAW_RUNTIME_STATE_ROOT = LAYOUT.runtimeStateRoot;
  process.env.TRENCHCLAW_DISABLE_LOG_IO_WORKER =
    process.env.TRENCHCLAW_DISABLE_LOG_IO_WORKER || (LAYOUT.kind === "release" ? "1" : "0");
  process.env.TRENCHCLAW_BOOT_REFRESH_CONTEXT = process.env.TRENCHCLAW_BOOT_REFRESH_CONTEXT ?? "0";
  process.env.TRENCHCLAW_BOOT_REFRESH_KNOWLEDGE = process.env.TRENCHCLAW_BOOT_REFRESH_KNOWLEDGE ?? "0";
  process.env.TRENCHCLAW_SETTINGS_BASE_FILE =
    process.env.TRENCHCLAW_SETTINGS_BASE_FILE ||
    path.join(LAYOUT.coreAssetRoot, "src/ai/config/safety-modes", toSettingsFileName(profile));
  process.env.TRENCHCLAW_FILESYSTEM_MANIFEST_FILE =
    process.env.TRENCHCLAW_FILESYSTEM_MANIFEST_FILE ||
    path.join(LAYOUT.coreAssetRoot, "src/ai/config/filesystem-manifest.json");
  process.env.TRENCHCLAW_PROMPT_MANIFEST_FILE =
    process.env.TRENCHCLAW_PROMPT_MANIFEST_FILE ||
    path.join(LAYOUT.coreAssetRoot, "src/ai/config/payload-manifest.json");
  process.env.TRENCHCLAW_KNOWLEDGE_DIR =
    process.env.TRENCHCLAW_KNOWLEDGE_DIR || path.join(bundledBrainRoot, "knowledge");
  process.env.TRENCHCLAW_KNOWLEDGE_MANIFEST_FILE =
    process.env.TRENCHCLAW_KNOWLEDGE_MANIFEST_FILE ||
    path.join(LAYOUT.runtimeStateRoot, "generated/knowledge-manifest.md");
  process.env.TRENCHCLAW_USER_SETTINGS_FILE =
    process.env.TRENCHCLAW_USER_SETTINGS_FILE ||
    path.join(LAYOUT.runtimeStateRoot, "user/settings.json");
  process.env.TRENCHCLAW_AI_SETTINGS_FILE =
    process.env.TRENCHCLAW_AI_SETTINGS_FILE || path.join(LAYOUT.runtimeStateRoot, "user/ai.json");
  process.env.TRENCHCLAW_AI_SETTINGS_TEMPLATE_FILE =
    process.env.TRENCHCLAW_AI_SETTINGS_TEMPLATE_FILE ||
    path.join(LAYOUT.coreAssetRoot, "src/ai/config/ai.template.json");
  process.env.TRENCHCLAW_VAULT_FILE =
    process.env.TRENCHCLAW_VAULT_FILE || path.join(LAYOUT.runtimeStateRoot, "user/vault.json");
  process.env.TRENCHCLAW_VAULT_TEMPLATE_FILE =
    process.env.TRENCHCLAW_VAULT_TEMPLATE_FILE || path.join(LAYOUT.runtimeStateRoot, "user/vault.template.json");
};

const logOptionalToolDiagnostics = (): void => {
  const missingTools: string[] = [];
  if (!Bun.which("solana")) {
    missingTools.push("solana");
  }
  if (!Bun.which("solana-keygen")) {
    missingTools.push("solana-keygen");
  }
  if (missingTools.length === 0) {
    return;
  }

  console.log(
    `${RUNNER_LOG_PREFIX} optional tools missing: ${emphasize(missingTools.join(", "))} (only required for specific features)`,
  );
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  if (args.includes("--version") || args.includes("-V")) {
    console.log(resolveBinaryVersion());
    return;
  }
  if (!existsSync(LAYOUT.guiIndexPath)) {
    throw new Error(`GUI build output not found at ${LAYOUT.guiIndexPath}. Run: bun run app:build`);
  }

  ensureRuntimeStateLayout();

  const runtimePort = await findAvailablePort(RUNTIME_HOST, DEFAULT_RUNTIME_PORT, "runtime");
  const guiPort =
    runtimePort === DEFAULT_GUI_PORT
      ? await findAvailablePort(RUNTIME_HOST, DEFAULT_GUI_PORT + 1, "gui")
      : await findAvailablePort(RUNTIME_HOST, DEFAULT_GUI_PORT, "gui");

  const runtimeUrl = `http://${RUNTIME_HOST}:${runtimePort}`;
  const guiUrl = `http://${RUNTIME_HOST}:${guiPort}`;

  await configureRuntimeEnvironment(runtimePort, guiUrl);

  console.log(`${RUNNER_LOG_PREFIX} mode: ${emphasize(LAYOUT.kind)}`);
  console.log(`${RUNNER_LOG_PREFIX} runtime state: ${emphasize(LAYOUT.runtimeStateRoot)}`);
  console.log(`${RUNNER_LOG_PREFIX} runtime target: ${emphasize(runtimeUrl)}`);
  console.log(`${RUNNER_LOG_PREFIX} gui target: ${emphasize(guiUrl)}`);
  logOptionalToolDiagnostics();

  const { bootstrapRuntime, startRuntimeServer } = await loadRuntimeImports();
  const runtime = await bootstrapRuntime();
  const runtimeServerInfo: RuntimeServerInfo = startRuntimeServer(runtime);
  let guiServer: Bun.Server<unknown> | null = createStaticServer({
    host: RUNTIME_HOST,
    port: guiPort,
    runtimeBaseUrl: runtimeServerInfo.url,
  });

  let shuttingDown = false;
  let shutdownResolve: (() => void) | null = null;
  const shutdownDone = new Promise<void>((resolve) => {
    shutdownResolve = resolve;
  });

  const shutdown = (exitCode: number): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    process.exitCode = exitCode;
    runtimeServerInfo.stop();
    runtime.stop();
    guiServer?.stop(true);
    guiServer = null;
    shutdownResolve?.();
  };

  const handleTerminationSignal = (): void => {
    shutdown(0);
  };

  process.on("SIGINT", handleTerminationSignal);
  process.on("SIGTERM", handleTerminationSignal);
  process.on("SIGHUP", handleTerminationSignal);
  process.once("exit", () => {
    if (!shuttingDown) {
      runtimeServerInfo.stop();
      runtime.stop();
      guiServer?.stop(true);
    }
  });

  console.log(`${RUNNER_LOG_PREFIX} GUI serving from ${emphasize(guiUrl)}`);
  if (process.env.TRENCHCLAW_RUNNER_SMOKE_TEST === "1") {
    const [runtimeHealth, guiResponse] = await Promise.all([
      fetch(new URL("/health", runtimeServerInfo.url)),
      fetch(guiUrl),
    ]);
    if (!runtimeHealth.ok) {
      throw new Error(`Runtime smoke test failed: GET /health returned ${runtimeHealth.status}`);
    }
    if (!guiResponse.ok) {
      throw new Error(`GUI smoke test failed: GET / returned ${guiResponse.status}`);
    }
    console.log(`${RUNNER_LOG_PREFIX} smoke test passed.`);
    shutdown(0);
    await shutdownDone;
    process.exit(0);
  }

  const guiLaunchDecision = await waitForGuiLaunchConfirmation();
  if (guiLaunchDecision === "quit") {
    console.log(`${RUNNER_LOG_PREFIX} shutdown requested before GUI launch.`);
    shutdown(0);
    await shutdownDone;
    return;
  }
  if (guiLaunchDecision === "skip") {
    console.log(`${RUNNER_LOG_PREFIX} GUI auto-launch skipped. Runtime remains active.`);
    console.log(`${RUNNER_LOG_PREFIX} Open manually when needed: ${emphasize(guiUrl)}`);
  } else {
    await openBrowser(guiUrl);
  }

  console.log(`${RUNNER_LOG_PREFIX} Runtime API listening at ${emphasize(runtimeServerInfo.url)}`);
  console.log(`${RUNNER_LOG_PREFIX} Press ${emphasize("Ctrl+C")} to stop.`);
  await shutdownDone;
};

await main();
