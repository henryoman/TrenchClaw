import { resolveHostPlatformTarget } from "./release-platform";

export const DEFAULT_RELEASE_COMPILE_TARGETS = [
  "bun-darwin-arm64",
  "bun-linux-x64",
  "bun-linux-arm64",
] as const;

export const RELEASE_CONFIG_ASSET_PATHS = [
  "src/ai/brain/config/prompts/system.md",
  "src/ai/brain/config/prompts/primary.md",
  "src/ai/brain/config/prompts/summarize.md",
  "src/ai/brain/config/safety-modes/safe.json",
  "src/ai/brain/config/safety-modes/dangerous.json",
  "src/ai/brain/config/safety-modes/veryDangerous.json",
  "src/runtime/security/filesystemManifest.json",
] as const;

export const RELEASE_RUNTIME_ASSET_PATHS = [
  "src/runtime/surface/router.ts",
] as const;

export const RELEASE_RUNTIME_SEED_ASSET_PATHS = [
  ".runtime/instances/00/instance.json",
  ".runtime/instances/00/secrets/vault.json",
  ".runtime/instances/00/settings/ai.json",
  ".runtime/instances/00/settings/settings.json",
  ".runtime/instances/00/settings/trading.json",
  ".runtime/instances/00/settings/wakeup.json",
  ".runtime/instances/00/workspace/configs/.gitkeep",
  ".runtime/instances/00/workspace/configs/news-feeds.json",
  ".runtime/instances/00/workspace/configs/tracker.json",
  ".runtime/instances/00/workspace/added-knowledge/.gitkeep",
] as const;

export const RELEASE_PLACEHOLDER_ASSET_PATHS = [
  "src/ai/brain/protected/keypairs/.keep",
] as const;

export const DEFAULT_RELEASE_BRAIN_EXCLUDE_PREFIXES = [
  "knowledge/deep-knowledge",
] as const;

export const RELEASE_COMPILE_WORKSPACE_PATHS = [
  "package.json",
  "bun.lock",
  "bunfig.toml",
  "tsconfig.json",
  "apps/runner",
  "apps/trenchclaw",
  "apps/types",
  "apps/frontends/gui/package.json",
  "website/package.json",
] as const;

export const RELEASE_BUILD_COMMANDS = {
  bundle: "bun run scripts/build-app.ts",
  verify: "bun run scripts/verify-app-bundle.ts",
  package: "bun run scripts/package-app-release.ts",
  smoke: "bun run scripts/smoke-test-release.ts",
} as const;

const parseCsv = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const normalizeCompileTarget = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Release compile target must not be empty.");
  }
  if (trimmed === "host") {
    const hostTarget = resolveHostPlatformTarget();
    if (!hostTarget) {
      throw new Error(`Unsupported host platform for "host" release target: ${process.platform}-${process.arch}`);
    }
    return `bun-${hostTarget}`;
  }
  return trimmed.startsWith("bun-") ? trimmed : `bun-${trimmed}`;
};

export const resolveReleaseCompileTargets = (env: NodeJS.ProcessEnv = process.env): string[] => {
  const configuredTargets = parseCsv(env.TRENCHCLAW_RELEASE_TARGETS);
  if (configuredTargets.length > 0) {
    return [...new Set(configuredTargets.map((target) => normalizeCompileTarget(target)))];
  }
  const hostTarget = resolveHostPlatformTarget();
  if (hostTarget) {
    return [`bun-${hostTarget}`];
  }
  return [...DEFAULT_RELEASE_COMPILE_TARGETS];
};

export const resolveReleaseBrainExcludePrefixes = (env: NodeJS.ProcessEnv = process.env): string[] => [
  ...DEFAULT_RELEASE_BRAIN_EXCLUDE_PREFIXES,
  ...parseCsv(env.TRENCHCLAW_RELEASE_BRAIN_EXCLUDE_PREFIXES),
];

export const resolveReleasePlanSnapshot = (env: NodeJS.ProcessEnv = process.env) => ({
  commands: RELEASE_BUILD_COMMANDS,
  targets: resolveReleaseCompileTargets(env),
  configAssets: [...RELEASE_CONFIG_ASSET_PATHS],
  runtimeAssets: [...RELEASE_RUNTIME_ASSET_PATHS],
  runtimeSeedAssets: [...RELEASE_RUNTIME_SEED_ASSET_PATHS],
  placeholderAssets: [...RELEASE_PLACEHOLDER_ASSET_PATHS],
  brainExcludePrefixes: resolveReleaseBrainExcludePrefixes(env),
  compileWorkspacePaths: [...RELEASE_COMPILE_WORKSPACE_PATHS],
});
