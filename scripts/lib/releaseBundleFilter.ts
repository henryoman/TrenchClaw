import path from "node:path";
import os from "node:os";

const toPosixPath = (value: string): string => value.split(path.sep).join("/");

const isSkillReferenceDoc = (relativeToBrain: string): boolean =>
  relativeToBrain.startsWith("knowledge/skills/") && relativeToBrain.includes("/references/");

export const shouldBundleBrainFile = (
  trackedFile: string,
  options?: { excludedPrefixes?: string[] },
): boolean => {
  const relativeToBrain = path.posix.relative("apps/trenchclaw/src/ai/brain", toPosixPath(trackedFile));
  if (!relativeToBrain || relativeToBrain.startsWith("..")) {
    return false;
  }

  const fileName = path.posix.basename(relativeToBrain).toLowerCase();
  const excludedPrefixes = (options?.excludedPrefixes ?? []).map((prefix) => prefix.trim()).filter((prefix) => prefix.length > 0);

  if (excludedPrefixes.some((prefix) => relativeToBrain === prefix || relativeToBrain.startsWith(`${prefix}/`))) {
    return false;
  }

  if (relativeToBrain === "protected/no-read/vault.json") {
    return false;
  }
  if (relativeToBrain === "protected/wallet-library.jsonl") {
    return false;
  }
  if (relativeToBrain.startsWith("db/")) {
    return false;
  }
  if (fileName.startsWith(".env") && fileName !== ".env.example") {
    return false;
  }
  if (fileName.endsWith(".pem") || fileName.endsWith(".key") || fileName.endsWith(".p12")) {
    return false;
  }

  if (relativeToBrain.startsWith("knowledge/skills/") && fileName.endsWith(".sh")) {
    return false;
  }
  if (relativeToBrain.startsWith("knowledge/deep-knowledge/")) {
    return false;
  }
  if (isSkillReferenceDoc(relativeToBrain)) {
    return false;
  }

  if (relativeToBrain.startsWith("protected/keypairs/")) {
    return fileName === ".keep" || fileName === ".gitkeep";
  }
  if (relativeToBrain.startsWith("protected/instance/")) {
    return fileName === ".gitkeep";
  }
  if (relativeToBrain.startsWith("protected/no-read/")) {
    return false;
  }

  return true;
};

export const hasBlockedBundlePath = (relativeBundlePath: string): string | null => {
  const normalized = toPosixPath(relativeBundlePath);
  const lower = normalized.toLowerCase();
  const fileName = path.posix.basename(normalized).toLowerCase();
  const isTrackedRuntimeSeedPath = normalized.startsWith("core/.runtime/instances/00/");

  if (
    fileName === "active-instance.json"
    || normalized.includes("/.runtime-state/")
    || normalized.startsWith(".runtime-state/")
    || normalized.includes("/runtime-state/")
    || normalized.startsWith("runtime-state/")
  ) {
    return `runtime state file should not be bundled: ${normalized}`;
  }
  if (
    !isTrackedRuntimeSeedPath
    && (
      normalized.includes("/.runtime/instances/")
      || normalized.startsWith(".runtime/instances/")
      || normalized.includes("/runtime/instances/")
      || normalized.startsWith("runtime/instances/")
    )
  ) {
    return `tracked runtime seed instance should not be bundled as mutable state: ${normalized}`;
  }
  if (normalized === "core/src/ai/brain/protected/wallet-library.jsonl") {
    return `blocked file present: ${normalized}`;
  }
  if (fileName.startsWith(".env") && fileName !== ".env.example") {
    return `environment file present in bundle: ${normalized}`;
  }
  if (normalized.includes("/node_modules/") || normalized.startsWith("node_modules/")) {
    return `node_modules should not be bundled: ${normalized}`;
  }
  if (normalized.startsWith("core/src/ai/brain/db/")) {
    return `runtime db/state file present in readonly bundle: ${normalized}`;
  }
  if (normalized.startsWith("core/src/ai/brain/protected/keypairs/") && fileName !== ".keep" && fileName !== ".gitkeep") {
    return `unexpected keypair file in bundle: ${normalized}`;
  }
  if (normalized.startsWith("core/src/ai/brain/protected/instance/") && fileName !== ".gitkeep") {
    return `unexpected instance-state file in bundle: ${normalized}`;
  }
  if (normalized.startsWith("core/src/ai/brain/protected/no-read/")) {
    return `unexpected no-read file in bundle: ${normalized}`;
  }
  if (fileName.endsWith(".sqlite") || fileName.endsWith(".jsonl") || fileName.endsWith(".log")) {
    return `runtime artifact present in bundle: ${normalized}`;
  }
  if (lower.endsWith(".pem") || lower.endsWith(".key") || lower.endsWith(".p12")) {
    return `blocked key/cert file in bundle: ${normalized}`;
  }
  if (normalized.startsWith("core/src/ai/brain/knowledge/skills/") && fileName.endsWith(".sh")) {
    return `skill installer scripts should not be bundled: ${normalized}`;
  }
  if (normalized.startsWith("core/src/ai/brain/knowledge/deep-knowledge/")) {
    return `deep vendor knowledge should not be bundled in beta release assets: ${normalized}`;
  }
  if (
    normalized.startsWith("core/src/ai/brain/knowledge/skills/")
    && normalized.includes("/references/")
  ) {
    return `skill reference docs should not be bundled in beta release assets: ${normalized}`;
  }
  if (
    normalized.includes("/tests/")
    || normalized.startsWith("tests/")
    || normalized.includes("/__tests__/")
    || fileName.includes(".test.")
    || fileName.includes(".spec.")
  ) {
    return `test-only file should not be bundled: ${normalized}`;
  }
  if (normalized.includes("/coverage/") || normalized.startsWith("coverage/")) {
    return `coverage output should not be bundled: ${normalized}`;
  }
  if (lower.endsWith(".map")) {
    return `source map should not be bundled in release assets: ${normalized}`;
  }
  if (fileName === ".ds_store") {
    return `desktop metadata file should not be bundled: ${normalized}`;
  }

  return null;
};

const normalizeNeedle = (value: string): string | null => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed.split(path.sep).join("/");
};

const defaultBlockedContentNeedles = (): string[] => {
  const needles = [
    normalizeNeedle(os.homedir()),
    normalizeNeedle(process.cwd()),
  ].filter((value): value is string => typeof value === "string" && value.length > 1);

  return [...new Set(needles)];
};

const BUNDLED_RUNTIME_SEED_VAULT_PATHS = new Set([
  ".runtime/instances/00/secrets/vault.json",
  "core/.runtime/instances/00/secrets/vault.json",
]);

const SAFE_TEMPLATE_STRING_VALUES = new Set([
  "",
  "custom",
]);

const findUnsafeVaultTemplateValue = (
  value: unknown,
  currentPath: string[] = [],
): string | null => {
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!SAFE_TEMPLATE_STRING_VALUES.has(normalized)) {
      return currentPath.join(".") || "<root>";
    }
    return null;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nestedViolation = findUnsafeVaultTemplateValue(value[index], [...currentPath, String(index)]);
      if (nestedViolation) {
        return nestedViolation;
      }
    }
    return null;
  }

  if (value && typeof value === "object") {
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      const nestedViolation = findUnsafeVaultTemplateValue(nestedValue, [...currentPath, key]);
      if (nestedViolation) {
        return nestedViolation;
      }
    }
  }

  return null;
};

export const hasBlockedSeedTemplateContent = (
  relativeBundlePath: string,
  content: string,
): string | null => {
  const normalizedPath = toPosixPath(relativeBundlePath);
  if (!BUNDLED_RUNTIME_SEED_VAULT_PATHS.has(normalizedPath)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    return `runtime seed vault template is not valid JSON: ${normalizedPath}`;
  }

  const unsafePath = findUnsafeVaultTemplateValue(parsed);
  if (unsafePath) {
    return `runtime seed vault template contains non-empty value at ${unsafePath}`;
  }

  return null;
};

export const hasBlockedBundleContent = (
  relativeBundlePath: string,
  content: string,
  options?: { blockedNeedles?: string[] },
): string | null => {
  const normalizedPath = toPosixPath(relativeBundlePath);
  const normalizedContent = content.replaceAll(path.sep, "/");
  const blockedNeedles = options?.blockedNeedles?.length ? options.blockedNeedles : defaultBlockedContentNeedles();

  for (const needle of blockedNeedles) {
    const normalizedNeedle = normalizeNeedle(needle);
    if (normalizedNeedle && normalizedContent.includes(normalizedNeedle)) {
      return `host-specific absolute path leaked into bundle file ${normalizedPath}`;
    }
  }

  const seedViolation = hasBlockedSeedTemplateContent(normalizedPath, content);
  if (seedViolation) {
    return seedViolation;
  }

  return null;
};
