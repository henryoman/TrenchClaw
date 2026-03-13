import { createUltraSignerAdapter } from "../adapters/ultra-signer";
import { findManagedWalletEntry } from "./wallet-manager";
import type { ManagedWalletRef } from "./wallet-types";

export const loadManagedWalletSigner = async (
  input: ManagedWalletRef & { rpcUrl?: string },
) => {
  const walletEntry = await findManagedWalletEntry(input);
  const walletFile = Bun.file(walletEntry.keypairFilePath);

  if (!(await walletFile.exists())) {
    throw new Error(`Managed wallet keypair file not found: ${walletEntry.keypairFilePath}`);
  }

  const parsed = await walletFile.json();
  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every((entry) => Number.isInteger(entry))) {
    throw new Error(`Managed wallet keypair file is invalid: ${walletEntry.keypairFilePath}`);
  }

  const privateKeyBytes =
    parsed.length === 32
      ? parsed
      : parsed.length === 64
        ? parsed.slice(0, 32)
        : null;
  if (!privateKeyBytes) {
    throw new Error(`Managed wallet keypair file must contain 32 or 64 integers: ${walletEntry.keypairFilePath}`);
  }

  return createUltraSignerAdapter({
    privateKey: new Uint8Array(privateKeyBytes as number[]),
    rpcUrl: input.rpcUrl,
  });
};
