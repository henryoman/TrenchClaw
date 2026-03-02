import path from "node:path";
import { z } from "zod";

import {
  assertWithinBrainProtectedDirectory,
  resolveAbsolutePath,
} from "../../../lib/wallet/protected-write-policy";

export const walletGroupNameSchema = z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/);

export const DEFAULT_WALLET_GROUP = "core-wallets";
export const WALLET_KEYPAIRS_ROOT = "src/ai/brain/protected/keypairs";
export const DEFAULT_WALLET_LIBRARY_PATH = "src/ai/brain/protected/wallet-library.jsonl";

export const resolveWalletKeypairRootPath = (): string => {
  const absoluteRoot = resolveAbsolutePath(WALLET_KEYPAIRS_ROOT);
  assertWithinBrainProtectedDirectory(absoluteRoot);
  return absoluteRoot;
};

export const resolveWalletGroupDirectoryPath = (walletGroup: string): string => {
  const safeGroup = walletGroupNameSchema.parse(walletGroup);
  const absoluteRoot = resolveWalletKeypairRootPath();
  const groupDirectoryPath = path.resolve(absoluteRoot, safeGroup);
  if (groupDirectoryPath !== absoluteRoot && !groupDirectoryPath.startsWith(`${absoluteRoot}${path.sep}`)) {
    throw new Error(`Wallet group path escapes keypair root: ${groupDirectoryPath}`);
  }
  assertWithinBrainProtectedDirectory(groupDirectoryPath);
  return groupDirectoryPath;
};
