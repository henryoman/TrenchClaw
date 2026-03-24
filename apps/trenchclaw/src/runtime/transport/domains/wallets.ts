import type { RuntimeApiWalletsResponse } from "@trenchclaw/types";
import {
  listManagedWalletTree,
  readManagedWalletBackupFile,
} from "../../../solana/lib/wallet/wallet-manager";
import type { RuntimeTransportContext } from "../contracts";

export const listWalletTree = async (_context: RuntimeTransportContext): Promise<RuntimeApiWalletsResponse> => {
  const snapshot = await listManagedWalletTree();
  return snapshot satisfies RuntimeApiWalletsResponse;
};

export const readWalletBackupFile = async (
  _context: RuntimeTransportContext,
  relativePathInput: string,
): Promise<{ fileName: string; content: string }> => {
  return readManagedWalletBackupFile(relativePathInput);
};
