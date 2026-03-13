import path from "node:path";

const toPosixPath = (value: string): string => value.split(path.sep).join("/");

export const shouldBundleBrainFile = (trackedFile: string): boolean => {
  const relativeToBrain = path.posix.relative("apps/trenchclaw/src/ai/brain", toPosixPath(trackedFile));
  if (!relativeToBrain || relativeToBrain.startsWith("..")) {
    return false;
  }

  const fileName = path.posix.basename(relativeToBrain).toLowerCase();

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

  return null;
};
