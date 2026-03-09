import path from "node:path";
import { z } from "zod";

import {
  assertWithinBrainProtectedDirectory,
  resolveAbsolutePath,
} from "../../../lib/wallet/protected-write-policy";
import { resolveCurrentActiveInstanceIdSync, resolveInstanceDirectoryPath } from "../../../../runtime/instance-state";
import { toRuntimeContractRelativePath } from "../../../../runtime/runtime-paths";

export const walletGroupNameSchema = z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/);

export const DEFAULT_WALLET_GROUP = "core-wallets";
export const WALLET_KEYPAIRS_DIRECTORY_NAME = "keypairs";
export const DEFAULT_WALLET_LIBRARY_FILE_NAME = "wallet-library.jsonl";
export const WALLET_LABEL_FILE_SUFFIX = ".label.json";
const WALLET_LIBRARY_PATH_ENV = "TRENCHCLAW_WALLET_LIBRARY_FILE";

const resolveActiveWalletInstanceId = (): string => {
  const instanceId = resolveCurrentActiveInstanceIdSync();
  if (!instanceId) {
    throw new Error("No active instance selected. Sign in before accessing wallets.");
  }
  return instanceId;
};

export const resolveWalletInstanceRootPath = (): string => {
  const absoluteRoot = resolveInstanceDirectoryPath(resolveActiveWalletInstanceId());
  assertWithinBrainProtectedDirectory(absoluteRoot);
  return absoluteRoot;
};

export const resolveWalletKeypairRootPath = (): string => {
  const absoluteRoot = resolveAbsolutePath(path.join(resolveWalletInstanceRootPath(), WALLET_KEYPAIRS_DIRECTORY_NAME));
  assertWithinBrainProtectedDirectory(absoluteRoot);
  return absoluteRoot;
};

export const resolveWalletKeypairRootRelativePath = (): string =>
  toRuntimeContractRelativePath(resolveWalletKeypairRootPath());

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

export const resolveWalletLibraryFilePath = (): string => {
  const configuredPath = process.env[WALLET_LIBRARY_PATH_ENV]?.trim();
  const absolutePath = resolveAbsolutePath(
    configuredPath && configuredPath.length > 0
      ? configuredPath
      : path.join(resolveWalletInstanceRootPath(), DEFAULT_WALLET_LIBRARY_FILE_NAME),
  );
  assertWithinBrainProtectedDirectory(absolutePath);
  return absolutePath;
};

export const isWalletLabelFileName = (fileName: string): boolean =>
  fileName.toLowerCase().endsWith(WALLET_LABEL_FILE_SUFFIX);

export const resolveWalletLabelFilePath = (keypairFilePath: string): string => {
  const absoluteKeypairFilePath = resolveAbsolutePath(keypairFilePath);
  const extension = path.extname(absoluteKeypairFilePath);
  const walletLabelFilePath = extension.length > 0
    ? absoluteKeypairFilePath.slice(0, -extension.length) + WALLET_LABEL_FILE_SUFFIX
    : `${absoluteKeypairFilePath}${WALLET_LABEL_FILE_SUFFIX}`;
  assertWithinBrainProtectedDirectory(walletLabelFilePath);
  return walletLabelFilePath;
};
