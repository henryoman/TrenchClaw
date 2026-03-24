export const DEFAULT_RELEASE_COMPILE_TARGETS = [
  "bun-darwin-arm64",
  "bun-linux-x64",
  "bun-linux-arm64",
] as const;

export const RELEASE_CONFIG_ASSET_PATHS = [
  "src/ai/config/ai.template.json",
  "src/ai/config/filesystem-manifest.json",
  "src/ai/config/payload-manifest.json",
  "src/ai/config/system.md",
  "src/ai/config/vault.template.json",
  "src/ai/config/agent-modes/primary.md",
  "src/ai/config/agent-modes/summarize.md",
  "src/ai/config/safety-modes/safe.json",
  "src/ai/config/safety-modes/dangerous.json",
  "src/ai/config/safety-modes/veryDangerous.json",
] as const;

export const RELEASE_RUNTIME_ASSET_PATHS = [
  "src/runtime/gui-transport/router.ts",
] as const;

export const RELEASE_PLACEHOLDER_ASSET_PATHS = [
  "src/ai/brain/protected/keypairs/.keep",
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

export const resolveReleaseBrainExcludePrefixes = (): string[] => parseCsv(
  process.env.TRENCHCLAW_RELEASE_BRAIN_EXCLUDE_PREFIXES,
);

export const resolveReleasePlanSnapshot = () => ({
  commands: RELEASE_BUILD_COMMANDS,
  targets: [...DEFAULT_RELEASE_COMPILE_TARGETS],
  configAssets: [...RELEASE_CONFIG_ASSET_PATHS],
  runtimeAssets: [...RELEASE_RUNTIME_ASSET_PATHS],
  placeholderAssets: [...RELEASE_PLACEHOLDER_ASSET_PATHS],
  brainExcludePrefixes: resolveReleaseBrainExcludePrefixes(),
});
