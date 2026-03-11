import {
  createKeyPairFromPrivateKeyBytes,
  createSolanaRpc,
  getAddressFromPublicKey,
} from "@solana/kit";
import {
  getBase64EncodedWireTransaction,
  getTransactionDecoder,
  signTransaction,
  type Transaction,
  type TransactionWithBlockhashLifetime,
} from "@solana/transactions";
import { parseStructuredFile, resolvePathFromModule } from "../../../ai/llm/shared";
import { ensureVaultFileExists } from "../../../ai/llm/vault-file";
import { resolveRequiredRpcUrl } from "../rpc/urls";

export interface UltraSignerAdapter {
  address: string;
  signBase64Transaction(base64Transaction: string): Promise<string>;
}

const DEFAULT_VAULT_FILE = "../../../ai/brain/protected/no-read/vault.json";
const DEFAULT_VAULT_TEMPLATE_FILE = "../../../ai/brain/protected/no-read/vault.template.json";
const VAULT_FILE_ENV = "TRENCHCLAW_VAULT_FILE";
const VAULT_TEMPLATE_FILE_ENV = "TRENCHCLAW_VAULT_TEMPLATE_FILE";

export const createUltraSignerAdapter = async (config: {
  privateKey: Uint8Array;
  rpcUrl?: string;
}): Promise<UltraSignerAdapter> => {
  const rpcUrl = resolveRequiredRpcUrl(config.rpcUrl);
  const rpc = createSolanaRpc(rpcUrl);
  const keyPair = await createKeyPairFromPrivateKeyBytes(config.privateKey);
  const signerAddress = await getAddressFromPublicKey(keyPair.publicKey);

  return {
    address: String(signerAddress),
    async signBase64Transaction(base64Transaction: string): Promise<string> {
      const transactionBytes = Buffer.from(base64Transaction, "base64");
      const parsedTransaction = getTransactionDecoder().decode(transactionBytes);
      const transaction = await ensureBlockhashLifetime(parsedTransaction, rpc);
      const signedTransaction = await signTransaction([keyPair], transaction);
      return getBase64EncodedWireTransaction(signedTransaction);
    },
  };
};

const getByPath = (root: unknown, segments: string[]): unknown => {
  let current = root;
  for (const segment of segments) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
};

const readVaultString = (root: unknown, refPath: string): string | undefined => {
  const value = getByPath(root, refPath.split("/").filter(Boolean));
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
};

export const createUltraSignerAdapterFromVault = async (input: {
  rpcUrl?: string;
} = {}): Promise<UltraSignerAdapter | undefined> => {
  const vaultPath = resolvePathFromModule(import.meta.url, DEFAULT_VAULT_FILE, process.env[VAULT_FILE_ENV]);
  const vaultTemplatePath = resolvePathFromModule(
    import.meta.url,
    DEFAULT_VAULT_TEMPLATE_FILE,
    process.env[VAULT_TEMPLATE_FILE_ENV],
  );
  await ensureVaultFileExists({
    vaultPath,
    templatePath: vaultTemplatePath,
  });
  const vaultData = await parseStructuredFile(vaultPath);
  const rawKey = readVaultString(vaultData, "wallet/ultra-signer/private-key");
  if (!rawKey) {
    return undefined;
  }

  const encoding = readVaultString(vaultData, "wallet/ultra-signer/private-key-encoding") ?? "base64";
  const privateKey = parsePrivateKey(rawKey, encoding.toLowerCase());

  return createUltraSignerAdapter({
    privateKey,
    rpcUrl: input.rpcUrl,
  });
};

function parsePrivateKey(value: string, encoding: string): Uint8Array {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error("Ultra signer private key is empty");
  }

  if (encoding === "bytes") {
    try {
      const parsed = JSON.parse(normalized);
      if (!Array.isArray(parsed) || !parsed.every((item) => Number.isInteger(item))) {
        throw new Error("bytes encoding expects JSON array of integers");
      }
      return new Uint8Array(parsed as number[]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Unable to parse bytes private key: ${message}`, { cause: error });
    }
  }

  if (encoding === "hex") {
    return new Uint8Array(Buffer.from(normalized, "hex"));
  }

  return new Uint8Array(Buffer.from(normalized, "base64"));
}

async function ensureBlockhashLifetime(
  transaction: Transaction,
  rpc: ReturnType<typeof createSolanaRpc>,
): Promise<Transaction & TransactionWithBlockhashLifetime> {
  if ("lifetimeConstraint" in transaction) {
    return transaction as Transaction & TransactionWithBlockhashLifetime;
  }

  const latestBlockhash = await rpc.getLatestBlockhash().send();

  return {
    ...transaction,
    lifetimeConstraint: {
      blockhash: latestBlockhash.value.blockhash,
      lastValidBlockHeight: latestBlockhash.value.lastValidBlockHeight,
    },
  } as Transaction & TransactionWithBlockhashLifetime;
}
