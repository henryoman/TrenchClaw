import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_VAULT_JSON = {
  rpc: {
    default: {
      "http-url": "",
      source: "custom",
      "public-id": "",
    },
    helius: {
      "http-url": "",
      "ws-url": "",
      "api-key": "",
    },
    quicknode: {
      "http-url": "",
      "ws-url": "",
      "api-key": "",
    },
    "solana-vibestation": {
      "api-key": "",
    },
    chainstack: {
      "api-key": "",
    },
    temporal: {
      "api-key": "",
    },
  },
  llm: {
    openrouter: {
      "api-key": "",
      model: "stepfun/step-3.5-flash:free",
      "base-url": "https://openrouter.ai/api/v1",
    },
    openai: {
      "api-key": "",
      model: "gpt-4.1-mini",
      "base-url": "",
    },
    "openai-compatible": {
      "api-key": "",
      model: "gpt-4.1-mini",
      "base-url": "",
    },
    gateway: {
      "api-key": "",
      model: "anthropic/claude-sonnet-4.5",
    },
    anthropic: {
      "api-key": "",
    },
    google: {
      "api-key": "",
    },
  },
  integrations: {
    dexscreener: {
      "api-key": "",
    },
    jupiter: {
      "api-key": "",
    },
  },
  wallet: {
    "ultra-signer": {
      "private-key": "",
      "private-key-encoding": "base64",
    },
  },
} as const;

export const ensureVaultFileExists = async (input: {
  vaultPath: string;
  templatePath?: string;
}): Promise<{ initializedFromTemplate: boolean }> => {
  const targetPath = path.resolve(input.vaultPath);
  try {
    const existing = await stat(targetPath);
    if (!existing.isFile()) {
      throw new Error(`Vault path exists but is not a file: "${targetPath}"`);
    }
    return { initializedFromTemplate: false };
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  await mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
  const templatePath = input.templatePath ? path.resolve(input.templatePath) : undefined;

  let content = `${JSON.stringify(DEFAULT_VAULT_JSON, null, 2)}\n`;
  if (templatePath) {
    try {
      content = await readFile(templatePath, "utf8");
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  await writeFile(targetPath, content, { encoding: "utf8", mode: 0o600 });
  try {
    await chmod(targetPath, 0o600);
  } catch {
    // Best-effort only (for platforms/filesystems without POSIX permission support).
  }

  return { initializedFromTemplate: true };
};

export const parseVaultJsonText = (value: string): Record<string, unknown> => {
  const parsed = JSON.parse(value) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Vault JSON must be an object at the root.");
  }
  return parsed as Record<string, unknown>;
};
