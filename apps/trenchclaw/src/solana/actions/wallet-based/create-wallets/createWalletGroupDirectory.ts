import { mkdir } from "node:fs/promises";
import { z } from "zod";

import type { Action } from "../../../../ai/contracts/types/action";
import { assertProtectedWriteAllowed } from "../../../lib/wallet/protected-write-policy";
import {
  resolveWalletGroupDirectoryPath,
  resolveWalletKeypairRootPath,
} from "../../../lib/wallet/wallet-manager";
import { walletGroupNameSchema } from "../../../lib/wallet/wallet-types";

const createWalletGroupDirectoryInputSchema = z.object({
  walletGroup: walletGroupNameSchema,
});

type CreateWalletGroupDirectoryInput = z.output<typeof createWalletGroupDirectoryInputSchema>;

interface CreateWalletGroupDirectoryOutput {
  walletGroup: string;
  directoryPath: string;
  keypairRootPath: string;
}

export const createWalletGroupDirectoryAction: Action<
  CreateWalletGroupDirectoryInput,
  CreateWalletGroupDirectoryOutput
> = {
  name: "createWalletGroupDirectory",
  category: "wallet-based",
  inputSchema: createWalletGroupDirectoryInputSchema,
  async execute(_ctx, rawInput) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();

    try {
      const input = createWalletGroupDirectoryInputSchema.parse(rawInput);
      const keypairRootPath = resolveWalletKeypairRootPath();
      const directoryPath = resolveWalletGroupDirectoryPath(input.walletGroup);

      await assertProtectedWriteAllowed({
        actor: _ctx.actor,
        targetPath: keypairRootPath,
        operation: "prepare wallet keypair root directory",
      });
      await assertProtectedWriteAllowed({
        actor: _ctx.actor,
        targetPath: directoryPath,
        operation: "create wallet group directory",
      });

      await mkdir(directoryPath, { recursive: true });

      return {
        ok: true,
        retryable: false,
        data: {
          walletGroup: input.walletGroup,
          directoryPath,
          keypairRootPath,
        },
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        retryable: false,
        error: message,
        code: "CREATE_WALLET_GROUP_DIRECTORY_FAILED",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }
  },
};
