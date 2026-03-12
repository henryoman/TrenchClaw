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
import { loadVaultLayers, readVaultString } from "../../../ai/llm/vault-file";
import { resolveRequiredRpcUrl } from "../rpc/urls";
import type { LoadedVaultLayers } from "../../../ai/llm/vault-file";

export interface UltraSignerAdapter {
  address: string;
  signBase64Transaction(base64Transaction: string): Promise<string>;
}

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

const resolveUltraSignerConfigFromVault = (vaultLayers: LoadedVaultLayers): {
  rawKey: string;
  encoding: string;
} | null => {
  const rawKey = readVaultString(vaultLayers.mergedVaultData, "wallet/ultra-signer/private-key");
  if (!rawKey) {
    return null;
  }

  return {
    rawKey,
    encoding: readVaultString(vaultLayers.mergedVaultData, "wallet/ultra-signer/private-key-encoding") ?? "base64",
  };
};

export const createUltraSignerAdapterFromVault = async (input: {
  rpcUrl?: string;
} = {}): Promise<UltraSignerAdapter | undefined> => {
  const vaultLayers = await loadVaultLayers();
  const signerConfig = resolveUltraSignerConfigFromVault(vaultLayers);
  if (!signerConfig) {
    return undefined;
  }

  const privateKey = parsePrivateKey(signerConfig.rawKey, signerConfig.encoding.toLowerCase());

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
