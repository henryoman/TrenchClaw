import type { GuiLlmCheckResponse } from "@trenchclaw/types";
import { resolveLlmProviderConfigFromVault } from "../../../ai/llm/config";
import { resolvePathFromModule } from "../../../ai/llm/shared";
import { RUNTIME_OWNED_ROOT } from "../../runtime-paths";

const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_VAULT_FILE = `${RUNTIME_OWNED_ROOT}/vault.json`;

const toKeyFingerprint = async (key: string): Promise<string | null> => {
  if (!key) {
    return null;
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 16);
};

const readProbeErrorMessage = async (response: Response): Promise<string> => {
  try {
    const payload = (await response.json()) as unknown;
    if (payload && typeof payload === "object" && "error" in payload) {
      const errorPayload = (payload as { error?: unknown }).error;
      if (errorPayload && typeof errorPayload === "object" && "message" in errorPayload) {
        const message = (errorPayload as { message?: unknown }).message;
        if (typeof message === "string" && message.trim().length > 0) {
          return message;
        }
      }
    }
  } catch {
    // Fall back to status text.
  }
  return response.statusText || `HTTP ${response.status}`;
};

const probeProviderAuth = async (input: {
  provider: string;
  baseURL: string | undefined;
  apiKey: string;
  timeoutMs?: number;
}): Promise<{ ok: boolean; status: number | null; message: string }> => {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseURL = (input.baseURL ?? "").trim().replace(/\/+$/u, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (input.provider === "openrouter") {
      const probeUrl = `${baseURL || OPENROUTER_DEFAULT_BASE_URL}/credits`;
      const response = await fetch(probeUrl, {
        method: "GET",
        headers: { Authorization: `Bearer ${input.apiKey}` },
        signal: controller.signal,
      });
      if (response.ok) {
        return { ok: true, status: response.status, message: "OpenRouter auth probe succeeded." };
      }
      return { ok: false, status: response.status, message: await readProbeErrorMessage(response) };
    }

    if (input.provider === "openai" || input.provider === "openai-compatible") {
      const probeUrl = `${baseURL || OPENAI_DEFAULT_BASE_URL}/models`;
      const response = await fetch(probeUrl, {
        method: "GET",
        headers: { Authorization: `Bearer ${input.apiKey}` },
        signal: controller.signal,
      });
      if (response.ok) {
        return { ok: true, status: response.status, message: "Provider auth probe succeeded." };
      }
      return { ok: false, status: response.status, message: await readProbeErrorMessage(response) };
    }

    return { ok: false, status: null, message: `Unsupported provider for probe: ${input.provider}` };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, status: null, message: `Auth probe timed out after ${timeoutMs}ms` };
    }
    return {
      ok: false,
      status: null,
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
};

export const runLlmCheck = async (): Promise<GuiLlmCheckResponse> => {
  const resolvedVaultFile = resolvePathFromModule(import.meta.url, DEFAULT_VAULT_FILE, process.env.TRENCHCLAW_VAULT_FILE);
  const fromVault = await resolveLlmProviderConfigFromVault();
  const active = fromVault;
  const vaultKey = fromVault?.apiKey ?? "";
  const vaultKeyFingerprint = await toKeyFingerprint(vaultKey);

  if (!active) {
    return {
      provider: null,
      model: null,
      baseURL: null,
      resolvedVaultFile,
      keySource: "none",
      keyConfigured: false,
      keyLength: 0,
      keyFingerprint: null,
      vaultKeyConfigured: false,
      vaultKeyLength: 0,
      vaultKeyFingerprint: null,
      probeOk: false,
      probeStatus: null,
      probeMessage: "No LLM key configured in vault.",
    };
  }

  const keyFingerprint = await toKeyFingerprint(active.apiKey);
  const skipProbe = (process.env.TRENCHCLAW_LLM_CHECK_SKIP_PROBE ?? "").trim() === "1";
  const probe = skipProbe
    ? { ok: false, status: null, message: "Probe skipped by configuration." }
    : await probeProviderAuth({
        provider: active.provider,
        baseURL: active.baseURL,
        apiKey: active.apiKey,
      });

  return {
    provider: active.provider,
    model: active.model,
    baseURL: active.baseURL ?? null,
    resolvedVaultFile,
    keySource: "vault",
    keyConfigured: active.apiKey.length > 0,
    keyLength: active.apiKey.length,
    keyFingerprint,
    vaultKeyConfigured: vaultKey.length > 0,
    vaultKeyLength: vaultKey.length,
    vaultKeyFingerprint,
    probeOk: probe.ok,
    probeStatus: probe.status,
    probeMessage: probe.message,
  };
};
