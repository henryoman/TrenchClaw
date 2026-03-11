import type { GuiWalletsResponse } from "@trenchclaw/types";
import {
  listManagedWalletTree,
  readManagedWalletBackupFile,
} from "../../../solana/lib/wallet/wallet-manager";
import type { RuntimeGuiDomainContext } from "../contracts";

export const listWalletTree = async (_context: RuntimeGuiDomainContext): Promise<GuiWalletsResponse> => {
  const snapshot = await listManagedWalletTree();
  return snapshot satisfies GuiWalletsResponse;
};

export const readWalletBackupFile = async (
  _context: RuntimeGuiDomainContext,
  relativePathInput: string,
): Promise<{ fileName: string; content: string }> => {
  return readManagedWalletBackupFile(relativePathInput);
};
