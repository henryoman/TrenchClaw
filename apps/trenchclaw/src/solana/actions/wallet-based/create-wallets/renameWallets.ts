import path from "node:path";
import { z } from "zod";

import type { Action } from "../../../../ai/runtime/types/action";
import {
  assertProtectedWriteAllowed,
  assertWithinBrainProtectedDirectory,
  resolveAbsolutePath,
} from "../../../lib/wallet/protected-write-policy";
import { resolveWalletLabelFilePath, resolveWalletLibraryFilePath } from "./wallet-storage";

const walletPathSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/);

const renameWalletsInputSchema = z.object({
  updateKeypairFiles: z.boolean().default(true),
  renames: z
    .array(
      z.object({
        from: walletPathSchema,
        to: walletPathSchema,
      }),
    )
    .min(1),
});

type RenameWalletsInput = z.output<typeof renameWalletsInputSchema>;

interface RenameWalletsOutput {
  walletLibraryFilePath: string;
  renamed: Array<{
    from: string;
    to: string;
    keypairFilePath?: string;
    address?: string;
  }>;
}

const parseWalletPath = (walletPath: string): { group: string; wallet: string } => {
  const [group, wallet] = walletPath.split(".");
  if (!group || !wallet) {
    throw new Error(`Invalid walletPath: ${walletPath}. Expected format group.wallet`);
  }
  return { group, wallet };
};

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

      const entryIndexByWalletPath = new Map<string, number>();
      entries.forEach((entry, index) => {
        const walletPath = entry.walletPath;
        if (typeof walletPath !== "string" || walletPath.length === 0) {
          throw new Error(`Wallet library line ${index + 1} is missing string field "walletPath"`);
        }

        if (entryIndexByWalletPath.has(walletPath)) {
          throw new Error(`Duplicate walletPath in library: ${walletPath}`);
        }
        entryIndexByWalletPath.set(walletPath, index);
      });

      const renamed: RenameWalletsOutput["renamed"] = [];

      const applyRenameAtIndex = async (index: number): Promise<void> => {
        const rename = input.renames[index];
        if (!rename) {
          return;
        }
        if (rename.from === rename.to) {
          await applyRenameAtIndex(index + 1);
          return;
        }

        const sourceIndex = entryIndexByWalletPath.get(rename.from);
        if (sourceIndex === undefined) {
          throw new Error(`Cannot rename missing walletPath "${rename.from}"`);
        }

        const existingTargetIndex = entryIndexByWalletPath.get(rename.to);
        if (existingTargetIndex !== undefined && existingTargetIndex !== sourceIndex) {
          throw new Error(`Cannot rename "${rename.from}" to "${rename.to}": target already exists`);
        }

        const entry = entries[sourceIndex] ?? {};
        const next = { ...entry };
        const parsed = parseWalletPath(rename.to);

        next.walletPath = rename.to;
        next.group = parsed.group;
        next.wallet = parsed.wallet;
        next.updatedAt = new Date().toISOString();

        entries[sourceIndex] = next;

        entryIndexByWalletPath.delete(rename.from);
        entryIndexByWalletPath.set(rename.to, sourceIndex);

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
          nextWalletLabel.walletPath = rename.to;
          nextWalletLabel.group = parsed.group;
          nextWalletLabel.wallet = parsed.wallet;
          nextWalletLabel.address = typeof next.address === "string" ? next.address : nextWalletLabel.address;
          nextWalletLabel.walletGroup = typeof next.walletGroup === "string" ? next.walletGroup : nextWalletLabel.walletGroup;
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
          from: rename.from,
          to: rename.to,
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
