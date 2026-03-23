import { loadVaultData, readVaultString } from "../../ai/llm/vault-file";

/** Vault path: `integrations/dune/api-key` (Secrets UI: Dune API key). */
export const resolveDuneApiKey = async (): Promise<string | undefined> => {
  const { vaultData } = await loadVaultData();
  return readVaultString(vaultData, "integrations/dune/api-key");
};
