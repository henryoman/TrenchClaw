import path from "node:path";
import { z } from "zod";

import type { Action } from "../../../../ai/runtime/types/action";
import {
  assertProtectedWriteAllowed,
  assertWithinBrainProtectedDirectory,
  resolveAbsolutePath,
} from "../../../lib/wallet/protected-write-policy";
import { resolveWalletLabelFilePath, resolveWalletLibraryFilePath, toWalletId, walletGroupNameSchema } from "./wallet-storage";

const walletNameSchema = z.string().trim().regex(/^[a-zA-Z0-9_-]+$/);

const renameWalletsInputSchema = z.object({
  walletGroup: walletGroupNameSchema,
  updateKeypairFiles: z.boolean().default(true),
  renames: z
    .array(
      z.object({
        fromWalletName: walletNameSchema,
        toWalletName: walletNameSchema,
      }),
    )
    .min(1),
});

type RenameWalletsInput = z.output<typeof renameWalletsInputSchema>;

interface RenameWalletsOutput {
  walletGroup: string;
  walletLibraryFilePath: string;
  renamed: Array<{
    fromWalletName: string;
    toWalletName: string;
    keypairFilePath?: string;
    address?: string;
  }>;
}

const toObjectRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Wallet library entry is not an object");
  }
  return { ...(value as Record<string, unknown>) };
};

export const renameWalletsAction: Action<RenameWalletsInput, RenameWalletsOutput> = {
  name: "renameWallets",
  category: "wallet-based",
  inputSchema: renameWalletsInputSchema,
  async execute(_ctx, rawInput) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();

    try {
      const input = renameWalletsInputSchema.parse(rawInput);
      const walletLibraryFilePath = resolveWalletLibraryFilePath();
      assertWithinBrainProtectedDirectory(walletLibraryFilePath);
      await assertProtectedWriteAllowed({
        actor: _ctx.actor,
        targetPath: walletLibraryFilePath,
        operation: "rename wallets in library",
      });

      const libraryFile = Bun.file(walletLibraryFilePath);
      if (!(await libraryFile.exists())) {
        throw new Error(`Wallet library file does not exist: ${walletLibraryFilePath}`);
      }

      const libraryText = await libraryFile.text();
      const libraryLines = libraryText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      if (libraryLines.length === 0) {
        throw new Error(`Wallet library file is empty: ${walletLibraryFilePath}`);
      }

      const entries = libraryLines.map((line, index) => {
        try {
          return toObjectRecord(JSON.parse(line));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`Invalid JSON on wallet library line ${index + 1}: ${message}`, { cause: error });
        }
      });

      const entryIndexByWalletId = new Map<string, number>();
      entries.forEach((entry, index) => {
        const walletId = entry.walletId;
        if (typeof walletId !== "string" || walletId.length === 0) {
          throw new Error(`Wallet library line ${index + 1} is missing string field "walletId"`);
        }

        if (entry.walletGroup !== input.walletGroup) {
          return;
        }
        if (entryIndexByWalletId.has(walletId)) {
          throw new Error(`Duplicate walletId in library: ${walletId}`);
        }
        entryIndexByWalletId.set(walletId, index);
      });

      const renamed: RenameWalletsOutput["renamed"] = [];

      const applyRenameAtIndex = async (index: number): Promise<void> => {
        const rename = input.renames[index];
        if (!rename) {
          return;
        }
        if (rename.fromWalletName === rename.toWalletName) {
          await applyRenameAtIndex(index + 1);
          return;
        }

        const fromWalletId = toWalletId(input.walletGroup, rename.fromWalletName);
        const toWalletIdValue = toWalletId(input.walletGroup, rename.toWalletName);
        const sourceIndex = entryIndexByWalletId.get(fromWalletId);
        if (sourceIndex === undefined) {
          throw new Error(`Cannot rename missing wallet "${fromWalletId}"`);
        }

        const existingTargetIndex = entryIndexByWalletId.get(toWalletIdValue);
        if (existingTargetIndex !== undefined && existingTargetIndex !== sourceIndex) {
          throw new Error(`Cannot rename "${fromWalletId}" to "${toWalletIdValue}": target already exists`);
        }

        const entry = entries[sourceIndex] ?? {};
        const next = { ...entry };

        next.walletId = toWalletIdValue;
        next.walletGroup = input.walletGroup;
        next.walletName = rename.toWalletName;
        next.updatedAt = new Date().toISOString();

        entries[sourceIndex] = next;

        entryIndexByWalletId.delete(fromWalletId);
        entryIndexByWalletId.set(toWalletIdValue, sourceIndex);

        const keypairFilePath = typeof next.keypairFilePath === "string" ? next.keypairFilePath : undefined;
        const walletLabelFilePath = typeof next.walletLabelFilePath === "string"
          ? next.walletLabelFilePath
          : (keypairFilePath ? resolveWalletLabelFilePath(keypairFilePath) : undefined);
        if (walletLabelFilePath) {
          next.walletLabelFilePath = walletLabelFilePath;
        }

        if (input.updateKeypairFiles && walletLabelFilePath) {
          const absoluteWalletLabelFilePath = resolveAbsolutePath(walletLabelFilePath);
          assertWithinBrainProtectedDirectory(absoluteWalletLabelFilePath);
          await assertProtectedWriteAllowed({
            actor: _ctx.actor,
            targetPath: absoluteWalletLabelFilePath,
            operation: "rewrite wallet label metadata",
          });

          const walletLabelFile = Bun.file(absoluteWalletLabelFilePath);
          const nextWalletLabel = await (async (): Promise<Record<string, unknown>> => {
            if (!(await walletLabelFile.exists())) {
              return {};
            }
            const walletLabelJson = await walletLabelFile.json();
            if (!walletLabelJson || typeof walletLabelJson !== "object" || Array.isArray(walletLabelJson)) {
              return {};
            }
            return { ...(walletLabelJson as Record<string, unknown>) };
          })();
          nextWalletLabel.version = 1;
          nextWalletLabel.walletId = toWalletIdValue;
          nextWalletLabel.walletGroup = input.walletGroup;
          nextWalletLabel.walletName = rename.toWalletName;
          nextWalletLabel.address = typeof next.address === "string" ? next.address : nextWalletLabel.address;
          if (keypairFilePath) {
            nextWalletLabel.walletFileName = path.basename(keypairFilePath);
          }
          nextWalletLabel.updatedAt = new Date().toISOString();
          if (typeof nextWalletLabel.createdAt !== "string") {
            nextWalletLabel.createdAt = typeof next.createdAt === "string" ? next.createdAt : nextWalletLabel.updatedAt;
          }
          await Bun.write(absoluteWalletLabelFilePath, `${JSON.stringify(nextWalletLabel, null, 2)}\n`);
        }

        renamed.push({
          fromWalletName: rename.fromWalletName,
          toWalletName: rename.toWalletName,
          keypairFilePath,
          address: typeof next.address === "string" ? next.address : undefined,
        });
        await applyRenameAtIndex(index + 1);
      };

      await applyRenameAtIndex(0);

      const nextLibrary = entries.map((entry) => JSON.stringify(entry)).join("\n");
      await assertProtectedWriteAllowed({
        actor: _ctx.actor,
        targetPath: walletLibraryFilePath,
        operation: "rewrite wallet library",
      });
      await Bun.write(walletLibraryFilePath, `${nextLibrary}\n`);

      return {
        ok: true,
        retryable: false,
        data: {
          walletGroup: input.walletGroup,
          walletLibraryFilePath,
          renamed,
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
        code: "RENAME_WALLETS_FAILED",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }
  },
};
