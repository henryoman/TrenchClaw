import { accessSync, constants as FsConstants, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
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
  bold: "\u001b[1m",
  neonTurquoise: "\u001b[38;2;0;245;212m",
  neonPurple: "\u001b[38;2;191;0;255m",
} as const;

const supportsColor = Boolean(process.stdout.isTTY) && !("NO_COLOR" in process.env);
const applyAnsi = (value: string, ...styles: Array<keyof typeof ANSI>): string =>
  supportsColor ? `${styles.map((style) => ANSI[style]).join("")}${value}${ANSI.reset}` : value;
const colorize = (value: string, color: keyof typeof ANSI): string => applyAnsi(value, color);
const RUNNER_LOG_PREFIX = colorize("@trenchclaw:", "neonPurple");
const emphasize = (value: string): string => colorize(value, "neonTurquoise");
const strong = (value: string): string => applyAnsi(value, "bold");
const spotlight = (value: string): string => applyAnsi(value, "bold", "neonTurquoise");
const DEFAULT_BOOTSTRAP_INSTANCE_ID = "00";
const DEFAULT_WORKSPACE_RUNTIME_STATE_DIRECTORY = ".trenchclaw-dev-runtime";

export type LayoutKind = "workspace" | "release";

export interface ResolvedLayout {
  kind: LayoutKind;
  root: string;
  guiDistDir: string;
  guiIndexPath: string;
  coreAssetRoot: string;
  runtimeStateRoot: string;
  generatedStateRoot: string;
}

type DoctorStatus = "ok" | "warn" | "missing";

interface DoctorCheck {
  id: string;
  label: string;
  status: DoctorStatus;
  details: string;
  fixHint?: string;
  blocking?: boolean;
}

interface DoctorFeatureReadiness {
  id: string;
  label: string;
  status: DoctorStatus;
  details: string;
}

interface DoctorSummary {
  ok: number;
  warn: number;
  missing: number;
  blocking: number;
}

export interface DoctorReport {
  generatedAt: string;
  version: string;
  layout: {
    kind: LayoutKind;
    root: string;
    guiIndexPath: string;
    runtimeStateRoot: string;
  };
  commands: {
    bun: string | null;
    solana: string | null;
    "solana-keygen": string | null;
    helius: string | null;
  };
  activeInstance: {
    id: string | null;
    source: "env" | "active-instance" | "single-instance" | "none";
    vaultPath: string | null;
    vaultExists: boolean;
  };
  checks: DoctorCheck[];
  featureReadiness: DoctorFeatureReadiness[];
  summary: DoctorSummary;
}

interface DoctorReportOptions {
  layout?: ResolvedLayout;
  version?: string;
  which?: (command: string) => string | null | undefined;
  env?: NodeJS.ProcessEnv;
}

const resolveAbsoluteConfiguredPath = (envKey: string, value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${envKey} must not be empty when set.`);
  }
  if (!path.isAbsolute(trimmed)) {
    throw new Error(`${envKey} must be an absolute path. Received "${trimmed}".`);
  }
  return path.resolve(trimmed);
};

const isWorkspaceRoot = (candidate: string): boolean =>
  existsSync(path.join(candidate, "apps/trenchclaw/package.json")) &&
  existsSync(path.join(candidate, "apps/frontends/gui"));

const isReleaseRoot = (candidate: string): boolean =>
  existsSync(path.join(candidate, "core", "src", "ai", "brain")) &&
  existsSync(path.join(candidate, "gui", "index.html"));

const resolveDefaultWorkspaceRuntimeStateRoot = (env: NodeJS.ProcessEnv): string =>
  path.join(env.HOME || env.USERPROFILE || process.cwd(), DEFAULT_WORKSPACE_RUNTIME_STATE_DIRECTORY);

const resolveDefaultRuntimeStateRoot = (env: NodeJS.ProcessEnv): string =>
  path.join(env.HOME || env.USERPROFILE || process.cwd(), ".trenchclaw");

const resolveDefaultGeneratedStateRoot = (runtimeStateRoot: string): string =>
  path.join(runtimeStateRoot, "instances", DEFAULT_BOOTSTRAP_INSTANCE_ID, "cache", "generated");

const resolveRuntimeStateRoot = (kind: LayoutKind, _coreAssetRoot: string, env: NodeJS.ProcessEnv = process.env): string => {
  const configured = env.TRENCHCLAW_RUNTIME_STATE_ROOT?.trim();
  if (configured) {
    return resolveAbsoluteConfiguredPath("TRENCHCLAW_RUNTIME_STATE_ROOT", configured);
  }

  if (kind === "workspace") {
    return resolveDefaultWorkspaceRuntimeStateRoot(env);
  }

  return resolveDefaultRuntimeStateRoot(env);
};

const resolveGeneratedStateRoot = (runtimeStateRoot: string): string => {
  return resolveDefaultGeneratedStateRoot(runtimeStateRoot);
};

export const resolveLayout = (env: NodeJS.ProcessEnv = process.env): ResolvedLayout => {
  const envReleaseRoot = env.TRENCHCLAW_RELEASE_ROOT?.trim();
  const candidates = [
    envReleaseRoot ? resolveAbsoluteConfiguredPath("TRENCHCLAW_RELEASE_ROOT", envReleaseRoot) : null,
    path.dirname(process.execPath),
    path.resolve(import.meta.dir, "../.."),
    path.resolve(import.meta.dir, "../../.."),
    process.cwd(),
  ].filter((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0);

  for (const candidate of candidates) {
    if (isReleaseRoot(candidate)) {
      const guiDistDir = path.join(candidate, "gui");
      const runtimeStateRoot = resolveRuntimeStateRoot("release", path.join(candidate, "core"), env);
      return {
        kind: "release",
        root: candidate,
        guiDistDir,
        guiIndexPath: path.join(guiDistDir, "index.html"),
        coreAssetRoot: path.join(candidate, "core"),
        runtimeStateRoot,
        generatedStateRoot: resolveGeneratedStateRoot(runtimeStateRoot),
      };
    }
    if (isWorkspaceRoot(candidate)) {
      const guiDistDir = path.join(candidate, "apps/frontends/gui/dist");
      const coreAssetRoot = path.join(candidate, "apps/trenchclaw");
      const runtimeStateRoot = resolveRuntimeStateRoot("workspace", coreAssetRoot, env);
      return {
        kind: "workspace",
        root: candidate,
        guiDistDir,
        guiIndexPath: path.join(guiDistDir, "index.html"),
        coreAssetRoot,
        runtimeStateRoot,
        generatedStateRoot: resolveGeneratedStateRoot(runtimeStateRoot),
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
  ensureInstanceLayout: (instanceId: string) => Promise<unknown>;
  resolveRuntimeSettingsProfile: () => RuntimeSettingsProfile;
  startRuntimeServer: typeof startRuntimeServerType;
}> | null = null;

const loadRuntimeImports = async (): Promise<{
  bootstrapRuntime: typeof bootstrapRuntimeType;
  ensureInstanceLayout: (instanceId: string) => Promise<unknown>;
  resolveRuntimeSettingsProfile: () => RuntimeSettingsProfile;
  startRuntimeServer: typeof startRuntimeServerType;
}> => {
  if (!runtimeImportsPromise) {
    runtimeImportsPromise = Promise.all([
      import("../trenchclaw/src/runtime/bootstrap"),
      import("../trenchclaw/src/runtime/instance-layout"),
      import("../trenchclaw/src/runtime/load"),
      import("../trenchclaw/src/runtime/start-runtime-server"),
    ]).then(([bootstrapModule, instanceLayoutModule, loadModule, serverModule]) => ({
      bootstrapRuntime: bootstrapModule.bootstrapRuntime,
      ensureInstanceLayout: instanceLayoutModule.ensureInstanceLayout,
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

const DOCTOR_STATUS_LABELS: Record<DoctorStatus, string> = {
  ok: "OK",
  warn: "WARN",
  missing: "MISSING",
};

const readJsonObjectSync = (filePath: string): Record<string, unknown> | null => {
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
};

const readStringPath = (root: unknown, segments: string[]): string | null => {
  let current = root;
  for (const segment of segments) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" && current.trim().length > 0 ? current.trim() : null;
};

const findNearestExistingAncestor = (targetPath: string): string | null => {
  let current = path.resolve(targetPath);
  while (true) {
    if (existsSync(current)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
};

const resolveDoctorStateRootStatus = (runtimeStateRoot: string): {
  status: DoctorStatus;
  details: string;
  blocking: boolean;
} => {
  const resolvedRoot = path.resolve(runtimeStateRoot);
  if (existsSync(resolvedRoot)) {
    try {
      accessSync(resolvedRoot, FsConstants.R_OK | FsConstants.W_OK);
      return {
        status: "ok",
        details: `Writable runtime state root detected at ${resolvedRoot}.`,
        blocking: false,
      };
    } catch {
      return {
        status: "missing",
        details: `Runtime state root exists at ${resolvedRoot}, but this process cannot read and write it.`,
        blocking: true,
      };
    }
  }

  const parent = findNearestExistingAncestor(path.dirname(resolvedRoot));
  if (!parent) {
    return {
      status: "missing",
      details: `Could not find an existing parent directory for ${resolvedRoot}.`,
      blocking: true,
    };
  }

  try {
    accessSync(parent, FsConstants.R_OK | FsConstants.W_OK);
    return {
      status: "ok",
      details: `Runtime state root will be created at ${resolvedRoot}; nearest writable parent is ${parent}.`,
      blocking: false,
    };
  } catch {
    return {
      status: "missing",
      details: `Runtime state root ${resolvedRoot} does not exist and nearest parent ${parent} is not writable.`,
      blocking: true,
    };
  }
};

const isTwoDigitInstanceId = (value: string): boolean => /^\d{2}$/u.test(value.trim());
const isVisibleInstanceId = (value: string): boolean => isTwoDigitInstanceId(value);

const resolveDoctorActiveInstance = (runtimeStateRoot: string, env: NodeJS.ProcessEnv): {
  id: string | null;
  source: "env" | "active-instance" | "single-instance" | "none";
} => {
  const fromEnv = env.TRENCHCLAW_ACTIVE_INSTANCE_ID?.trim();
  if (fromEnv && isVisibleInstanceId(fromEnv)) {
    return { id: fromEnv, source: "env" };
  }

  const instanceRoot = path.join(runtimeStateRoot, "instances");
  const activeInstancePath = path.join(instanceRoot, "active-instance.json");
  const persisted = readJsonObjectSync(activeInstancePath);
  const persistedId = typeof persisted?.localInstanceId === "string" ? persisted.localInstanceId.trim() : "";
  if (persistedId && isVisibleInstanceId(persistedId)) {
    return { id: persistedId, source: "active-instance" };
  }

  if (!existsSync(instanceRoot)) {
    return { id: null, source: "none" };
  }

  try {
    const instanceIds = readdirSync(instanceRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && isVisibleInstanceId(entry.name))
      .map((entry) => entry.name)
      .toSorted((left, right) => left.localeCompare(right));
    if (instanceIds.length === 1) {
      return { id: instanceIds[0] ?? null, source: "single-instance" };
    }
  } catch {
    // Ignore and fall through.
  }

  return { id: null, source: "none" };
};

const hasHeliusVaultConfig = (vaultData: Record<string, unknown> | null): boolean => {
  if (!vaultData) {
    return false;
  }
  const providerId = readStringPath(vaultData, ["rpc", "default", "provider-id"]);
  const defaultHttpUrl = readStringPath(vaultData, ["rpc", "default", "http-url"]);
  const legacyApiKey = readStringPath(vaultData, ["rpc", "helius", "api-key"]);
  return providerId === "helius"
    || Boolean(defaultHttpUrl && defaultHttpUrl.includes("helius-rpc.com"))
    || Boolean(legacyApiKey);
};

const hasAiKey = (vaultData: Record<string, unknown> | null): boolean =>
  Boolean(
    readStringPath(vaultData, ["llm", "openrouter", "api-key"])
    || readStringPath(vaultData, ["llm", "gateway", "api-key"]),
  );

const hasJupiterKey = (vaultData: Record<string, unknown> | null): boolean =>
  Boolean(readStringPath(vaultData, ["integrations", "jupiter", "api-key"]));

const summarizeDoctorChecks = (checks: readonly DoctorCheck[]): DoctorSummary =>
  checks.reduce<DoctorSummary>(
    (summary, check) => {
      summary[check.status] += 1;
      if (check.blocking && check.status !== "ok") {
        summary.blocking += 1;
      }
      return summary;
    },
    { ok: 0, warn: 0, missing: 0, blocking: 0 },
  );

export const collectDoctorReport = (options: DoctorReportOptions = {}): DoctorReport => {
  const layout = options.layout ?? LAYOUT;
  const env = options.env ?? process.env;
  const which = options.which ?? ((command: string) => Bun.which(command) ?? null);
  const version = options.version ?? resolveBinaryVersion();

  const commands = {
    bun: which("bun") ?? null,
    solana: which("solana") ?? null,
    "solana-keygen": which("solana-keygen") ?? null,
    helius: which("helius") ?? null,
  } as const;

  const stateRootStatus = resolveDoctorStateRootStatus(layout.runtimeStateRoot);
  const activeInstance = resolveDoctorActiveInstance(layout.runtimeStateRoot, env);
  const vaultPath = activeInstance.id
    ? path.join(layout.runtimeStateRoot, "instances", activeInstance.id, "secrets", "vault.json")
    : null;
  const vaultExists = Boolean(vaultPath && existsSync(vaultPath));
  const vaultData = vaultPath ? readJsonObjectSync(vaultPath) : null;
  const aiKeyReady = hasAiKey(vaultData);
  const jupiterKeyReady = hasJupiterKey(vaultData);
  const heliusReady = hasHeliusVaultConfig(vaultData);
  const releaseMetadataPath = path.join(layout.root, "release-metadata.json");

  const checks: DoctorCheck[] = [
    {
      id: "app-layout",
      label: "App bundle",
      status: existsSync(layout.guiIndexPath) ? "ok" : "missing",
      details: existsSync(layout.guiIndexPath)
        ? `GUI assets detected at ${layout.guiIndexPath}.`
        : `GUI assets are missing at ${layout.guiIndexPath}. Build or reinstall TrenchClaw before launching.`,
      fixHint: existsSync(layout.guiIndexPath) ? undefined : "Run the app build or reinstall the packaged release.",
      blocking: !existsSync(layout.guiIndexPath),
    },
    {
      id: "release-metadata",
      label: "Release metadata",
      status: layout.kind === "release" ? (existsSync(releaseMetadataPath) ? "ok" : "warn") : "ok",
      details: layout.kind === "release"
        ? existsSync(releaseMetadataPath)
          ? `Release metadata detected at ${releaseMetadataPath}.`
          : `Release metadata file is missing at ${releaseMetadataPath}. The app can still run, but the release bundle looks incomplete.`
        : `Workspace mode detected; package metadata will be used instead of bundled release metadata.`,
      fixHint: layout.kind === "release" && !existsSync(releaseMetadataPath)
        ? "Reinstall from a complete GitHub Release artifact."
        : undefined,
    },
    {
      id: "runtime-state-root",
      label: "Runtime state root",
      status: stateRootStatus.status,
      details: stateRootStatus.details,
      fixHint: stateRootStatus.status === "ok"
        ? undefined
        : "Set TRENCHCLAW_RUNTIME_STATE_ROOT to a writable absolute path or fix directory permissions.",
      blocking: stateRootStatus.blocking,
    },
    {
      id: "active-instance",
      label: "Active instance",
      status: activeInstance.id ? "ok" : "warn",
      details: activeInstance.id
        ? `Using instance ${activeInstance.id} from ${activeInstance.source}.`
        : "No active instance detected yet. Sign in or create an instance before wallet and vault workflows.",
      fixHint: activeInstance.id ? undefined : "Launch TrenchClaw and sign into an instance first.",
    },
    {
      id: "instance-vault",
      label: "Instance vault",
      status: !activeInstance.id ? "warn" : vaultExists ? "ok" : "warn",
      details: !activeInstance.id
        ? "No active instance means there is no instance-scoped vault to inspect yet."
        : vaultExists
          ? `Instance vault detected at ${vaultPath}.`
          : `Expected instance vault at ${vaultPath}, but it does not exist yet.`,
      fixHint: !activeInstance.id ? undefined : vaultExists ? undefined : "Open the vault or secrets UI once to create and populate the instance vault.",
    },
    {
      id: "ai-key",
      label: "AI provider key",
      status: !activeInstance.id ? "warn" : aiKeyReady ? "ok" : "warn",
      details: !activeInstance.id
        ? "AI key readiness cannot be checked until an instance vault exists."
        : aiKeyReady
          ? "Found at least one AI key in the active instance vault."
          : "No OpenRouter or Gateway key found in the active instance vault.",
      fixHint: !activeInstance.id || aiKeyReady ? undefined : "Add an OpenRouter or Gateway API key in the vault or secrets panel.",
    },
    {
      id: "jupiter-key",
      label: "Jupiter API key",
      status: !activeInstance.id ? "warn" : jupiterKeyReady ? "ok" : "warn",
      details: !activeInstance.id
        ? "Jupiter key readiness cannot be checked until an instance vault exists."
        : jupiterKeyReady
          ? "Jupiter portal API key detected (Ultra, Swap API, Trigger)."
          : "No Jupiter API key found in the active instance vault.",
      fixHint: !activeInstance.id || jupiterKeyReady ? undefined : "Add your portal.jup.ag API key in the vault or secrets panel before Ultra swaps, standard swaps, or trigger orders.",
    },
    {
      id: "helius-config",
      label: "Helius-backed RPC setup",
      status: !activeInstance.id ? "warn" : heliusReady ? "ok" : "warn",
      details: !activeInstance.id
        ? "Helius-backed reads cannot be checked until an instance vault exists."
        : heliusReady
          ? "Helius-backed RPC credentials are configured for the active instance."
          : "No Helius-backed RPC credential or legacy Helius API key found in the active instance vault.",
      fixHint: !activeInstance.id || heliusReady ? undefined : "Set a Helius private RPC credential in the secrets panel if you want Helius-enriched reads or swap history.",
    },
    {
      id: "solana-cli",
      label: "Solana CLI",
      status: commands.solana ? "ok" : "warn",
      details: commands.solana
        ? `Detected at ${commands.solana}.`
        : "Solana CLI is not installed. This does not block first launch, but some shell and power-user workflows expect it.",
      fixHint: commands.solana ? undefined : "Install with the tool helper or the official Anza installer when a workflow needs it.",
    },
    {
      id: "solana-keygen",
      label: "solana-keygen",
      status: commands["solana-keygen"] ? "ok" : "warn",
      details: commands["solana-keygen"]
        ? `Detected at ${commands["solana-keygen"]}.`
        : "solana-keygen is not installed. Vanity wallet helper flows depend on it.",
      fixHint: commands["solana-keygen"] ? undefined : "Install Solana CLI to provide solana-keygen.",
    },
    {
      id: "helius-cli",
      label: "Helius CLI",
      status: commands.helius ? "ok" : "warn",
      details: commands.helius
        ? `Detected at ${commands.helius}.`
        : "Helius CLI is not installed. This does not block first launch, but CLI-backed shell workflows will ask for it.",
      fixHint: commands.helius ? undefined : "Install with the tool helper or `bun add -g helius-cli@latest` when a workflow needs it.",
    },
  ];

  const featureReadiness: DoctorFeatureReadiness[] = [
    {
      id: "baseline-launch",
      label: "Baseline first launch",
      status: stateRootStatus.status === "ok" && existsSync(layout.guiIndexPath) ? "ok" : "missing",
      details: stateRootStatus.status === "ok" && existsSync(layout.guiIndexPath)
        ? "The local install looks healthy enough to launch TrenchClaw."
        : "The local install is missing app assets or a writable state root.",
    },
    {
      id: "chat-workflows",
      label: "Chat-driven workflows",
      status: activeInstance.id && aiKeyReady ? "ok" : "warn",
      details: activeInstance.id && aiKeyReady
        ? "Active instance and AI key are both ready."
        : "Needs an active instance plus an OpenRouter or Gateway key.",
    },
    {
      id: "managed-wallet-reads",
      label: "Managed wallet reads",
      status: activeInstance.id ? "ok" : "warn",
      details: activeInstance.id
        ? "Instance-scoped wallet workflows can resolve against the active instance."
        : "Needs an active instance before managed wallet reads are useful.",
    },
    {
      id: "helius-enriched-reads",
      label: "Helius-enriched reads and swap history",
      status: activeInstance.id && heliusReady ? "ok" : "warn",
      details: activeInstance.id && heliusReady
        ? "Helius-backed RPC credentials are ready for enriched reads."
        : "Needs an active instance and Helius-backed RPC credentials.",
    },
    {
      id: "ultra-workflows",
      label: "Ultra swaps and trigger orders",
      status: activeInstance.id && jupiterKeyReady ? "ok" : "warn",
      details: activeInstance.id && jupiterKeyReady
        ? "Active instance and Jupiter API key are ready."
        : "Needs an active instance and a Jupiter portal API key.",
    },
    {
      id: "cli-shell-workflows",
      label: "CLI-driven shell workflows",
      status: commands.solana && commands.helius ? "ok" : "warn",
      details: commands.solana && commands.helius
        ? "Both Solana CLI and Helius CLI are available in the shell environment."
        : "Needs Solana CLI and Helius CLI when workflows explicitly depend on shell tooling.",
    },
    {
      id: "vanity-wallet-helper",
      label: "Vanity wallet helper",
      status: commands["solana-keygen"] ? "ok" : "warn",
      details: commands["solana-keygen"]
        ? "solana-keygen is available."
        : "Needs solana-keygen from the Solana CLI install.",
    },
  ];

  const summary = summarizeDoctorChecks(checks);

  return {
    generatedAt: new Date().toISOString(),
    version,
    layout: {
      kind: layout.kind,
      root: layout.root,
      guiIndexPath: layout.guiIndexPath,
      runtimeStateRoot: layout.runtimeStateRoot,
    },
    commands,
    activeInstance: {
      id: activeInstance.id,
      source: activeInstance.source,
      vaultPath,
      vaultExists,
    },
    checks,
    featureReadiness,
    summary,
  };
};

export const formatDoctorReport = (report: DoctorReport): string => {
  const lines = [
    strong("TrenchClaw doctor"),
    `${RUNNER_LOG_PREFIX} version: ${report.version}`,
    `${RUNNER_LOG_PREFIX} mode: ${report.layout.kind}`,
    `${RUNNER_LOG_PREFIX} app root: ${report.layout.root}`,
    `${RUNNER_LOG_PREFIX} runtime state: ${report.layout.runtimeStateRoot}`,
    `${RUNNER_LOG_PREFIX} summary: ${report.summary.ok} ok, ${report.summary.warn} warnings, ${report.summary.missing} missing, ${report.summary.blocking} blocking`,
    "",
    strong("Checks"),
  ];

  for (const check of report.checks) {
    lines.push(`- [${DOCTOR_STATUS_LABELS[check.status]}] ${check.label}: ${check.details}`);
    if (check.fixHint) {
      lines.push(`  fix: ${check.fixHint}`);
    }
  }

  lines.push("", strong("Feature Readiness"));
  for (const feature of report.featureReadiness) {
    lines.push(`- [${DOCTOR_STATUS_LABELS[feature.status]}] ${feature.label}: ${feature.details}`);
  }

  return lines.join("\n");
};

const runDoctor = (args: string[]): number => {
  const report = collectDoctorReport();
  if (args.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatDoctorReport(report));
  }
  return report.summary.blocking > 0 ? 1 : 0;
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

const resolveRuntimeBootstrapInstanceId = (): string =>
  resolveDoctorActiveInstance(LAYOUT.runtimeStateRoot, process.env).id ?? DEFAULT_BOOTSTRAP_INSTANCE_ID;

const ensureRuntimeBootstrapInstance = async (): Promise<string> => {
  const instanceId = resolveRuntimeBootstrapInstanceId();
  const { ensureInstanceLayout } = await loadRuntimeImports();
  await ensureInstanceLayout(instanceId);
  return instanceId;
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

const showGuiLaunchWelcome = (guiUrl: string): void => {
  console.log("");
  console.log(strong("Welcome to TrenchClaw"));
  console.log(spotlight("PRESS ENTER TO OPEN GUI"));
  console.log(`${RUNNER_LOG_PREFIX} GUI: ${guiUrl}`);
  console.log(`${RUNNER_LOG_PREFIX} Type "skip" to keep it in the terminal, or "quit" to stop.`);
};

const waitForGuiLaunchConfirmation = async (guiUrl: string): Promise<GuiLaunchDecision> => {
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
    showGuiLaunchWelcome(guiUrl);

    const answer = (await prompt.question(`${RUNNER_LOG_PREFIX} > `))
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

const ensureRuntimeStateLayout = (): void => {
  const directories = [
    path.join(LAYOUT.runtimeStateRoot, "db"),
    path.join(LAYOUT.runtimeStateRoot, "db/events"),
    path.join(LAYOUT.runtimeStateRoot, "runtime"),
    path.join(LAYOUT.runtimeStateRoot, "instances"),
    path.join(LAYOUT.runtimeStateRoot, "protected/keypairs"),
  ];

  for (const directory of directories) {
    mkdirSync(directory, { recursive: true });
  }

  const placeholders: Array<{ source: string; target: string }> = [
    {
      source: path.join(LAYOUT.coreAssetRoot, "src/ai/brain/protected/keypairs/.keep"),
      target: path.join(LAYOUT.runtimeStateRoot, "protected/keypairs/.keep"),
    },
  ];

  for (const placeholder of placeholders) {
    copyFileIfMissing(placeholder.source, placeholder.target);
  }
};

const toSettingsFileName = (profile: RuntimeSettingsProfile): string =>
  profile === "veryDangerous" ? "veryDangerous.json" : `${profile}.json`;

const configureRuntimeEnvironment = async (runtimePort: number, guiUrl: string): Promise<void> => {
  const { resolveRuntimeSettingsProfile } = await loadRuntimeImports();
  const profile = resolveRuntimeSettingsProfile();
  const bundledBrainRoot = path.join(LAYOUT.coreAssetRoot, "src/ai/brain");
  const activeInstanceId = process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID?.trim() || resolveRuntimeBootstrapInstanceId();
  const generatedStateRoot = path.join(LAYOUT.runtimeStateRoot, "instances", activeInstanceId, "cache", "generated");

  process.env.RUNTIME_HOST = RUNTIME_HOST;
  process.env.RUNTIME_PORT = String(runtimePort);
  process.env.RUNTIME_STRICT_PORT = "1";
  process.env.RUNTIME_REQUIRE_SERVER = "1";
  process.env.TRENCHCLAW_GUI_URL = guiUrl;
  process.env.TRENCHCLAW_RELEASE_ROOT = LAYOUT.root;
  process.env.TRENCHCLAW_APP_ROOT = LAYOUT.coreAssetRoot;
  process.env.TRENCHCLAW_RUNTIME_STATE_ROOT = LAYOUT.runtimeStateRoot;
  process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = activeInstanceId;
  process.env.TRENCHCLAW_DISABLE_LOG_IO_WORKER =
    process.env.TRENCHCLAW_DISABLE_LOG_IO_WORKER || (LAYOUT.kind === "release" ? "1" : "0");
  process.env.TRENCHCLAW_BOOT_REFRESH_CONTEXT = process.env.TRENCHCLAW_BOOT_REFRESH_CONTEXT ?? "0";
  process.env.TRENCHCLAW_BOOT_REFRESH_KNOWLEDGE = process.env.TRENCHCLAW_BOOT_REFRESH_KNOWLEDGE ?? "0";
  process.env.TRENCHCLAW_SETTINGS_BASE_FILE =
    process.env.TRENCHCLAW_SETTINGS_BASE_FILE ||
    path.join(LAYOUT.coreAssetRoot, "src/ai/brain/config/safety-modes", toSettingsFileName(profile));
  process.env.TRENCHCLAW_FILESYSTEM_MANIFEST_FILE =
    process.env.TRENCHCLAW_FILESYSTEM_MANIFEST_FILE ||
    path.join(LAYOUT.coreAssetRoot, "src/runtime/security/filesystem-manifest.json");
  process.env.TRENCHCLAW_KNOWLEDGE_DIR =
    process.env.TRENCHCLAW_KNOWLEDGE_DIR || path.join(bundledBrainRoot, "knowledge");
  process.env.TRENCHCLAW_KNOWLEDGE_INDEX_FILE =
    process.env.TRENCHCLAW_KNOWLEDGE_INDEX_FILE ||
    path.join(generatedStateRoot, "knowledge-index.md");
  process.env.TRENCHCLAW_KNOWLEDGE_MANIFEST_FILE =
    process.env.TRENCHCLAW_KNOWLEDGE_MANIFEST_FILE ||
    process.env.TRENCHCLAW_KNOWLEDGE_INDEX_FILE;
};

const logOptionalToolDiagnostics = (): void => {
  const missingTools: string[] = [];
  if (!Bun.which("solana")) {
    missingTools.push("solana");
  }
  if (!Bun.which("solana-keygen")) {
    missingTools.push("solana-keygen");
  }
  if (!Bun.which("helius")) {
    missingTools.push("helius");
  }
  if (missingTools.length === 0) {
    return;
  }

  console.log(
    `${RUNNER_LOG_PREFIX} optional tools missing: ${emphasize(missingTools.join(", "))} (only required for specific features; run ${strong("trenchclaw doctor")} for details)`,
  );
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  if (args.includes("--version") || args.includes("-V")) {
    console.log(resolveBinaryVersion());
    return;
  }
  if (args[0] === "doctor" || args.includes("--doctor")) {
    process.exitCode = runDoctor(args);
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
  await ensureRuntimeBootstrapInstance();

  console.log(`${RUNNER_LOG_PREFIX} mode: ${LAYOUT.kind}`);
  console.log(`${RUNNER_LOG_PREFIX} runtime state: ${LAYOUT.runtimeStateRoot}`);
  console.log(`${RUNNER_LOG_PREFIX} runtime target: ${runtimeUrl}`);
  console.log(`${RUNNER_LOG_PREFIX} gui target: ${guiUrl}`);
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

  console.log(`${RUNNER_LOG_PREFIX} GUI serving from ${guiUrl}`);
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

  const guiLaunchDecision = await waitForGuiLaunchConfirmation(guiUrl);
  if (guiLaunchDecision === "quit") {
    console.log(`${RUNNER_LOG_PREFIX} shutdown requested before GUI launch.`);
    shutdown(0);
    await shutdownDone;
    return;
  }
  if (guiLaunchDecision === "skip") {
    console.log(`${RUNNER_LOG_PREFIX} GUI auto-launch skipped. Runtime remains active.`);
    console.log(`${RUNNER_LOG_PREFIX} Open manually when needed: ${strong(guiUrl)}`);
  } else {
    await openBrowser(guiUrl);
  }

  console.log(`${RUNNER_LOG_PREFIX} Runtime API listening at ${runtimeServerInfo.url}`);
  console.log(`${RUNNER_LOG_PREFIX} Press ${strong("Ctrl+C")} to stop.`);
  await shutdownDone;
};

if (import.meta.main) {
  await main();
}
