import path from "node:path";
import { z } from "zod";

import type { Action } from "../../../ai/contracts/types/action";
import {
  assertProtectedWriteAllowed,
  assertWithinBrainProtectedDirectory,
  resolveAbsolutePath,
} from "../../../runtime/security/protectedWritePolicy";
import {
  readManagedWalletLibraryEntries,
  resolveWalletLibraryFilePath,
  resolveWalletLabelFilePath,
  rewriteManagedWalletLibraryEntries,
} from "../../../solana/lib/wallet/walletManager";
import {
  type ManagedWalletLibraryEntry,
  toWalletId,
  walletGroupNameSchema,
} from "../../../solana/lib/wallet/walletTypes";

const walletNameSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9_-]+$/)
  .describe("Wallet name label. Use letters, numbers, underscores, or hyphens only.");

const walletReferenceSchema = z
  .object({
    walletGroup: walletGroupNameSchema.describe("Current wallet group label stored in the protected wallet library."),
    walletName: walletNameSchema.describe("Current wallet name label stored in the protected wallet library."),
  })
  .strict()
  .describe("Explicitly identifies one wallet by its current organization labels.");

const walletOrganizationTargetSchema = z
  .object({
    walletGroup: walletGroupNameSchema.describe("New wallet group label to store for this wallet."),
    walletName: walletNameSchema.describe("New wallet name label to store for this wallet."),
  })
  .strict()
  .describe("Desired organization labels for the same wallet.");

const walletEditSchema = z
  .object({
    current: walletReferenceSchema.describe("The wallet's current group/name labels."),
    next: walletOrganizationTargetSchema.describe("The wallet's new group/name labels."),
  })
  .strict()
  .refine(
    (value) =>
      value.current.walletGroup !== value.next.walletGroup || value.current.walletName !== value.next.walletName,
    {
      message: "current and next labels must differ.",
      path: ["next"],
    },
  )
  .describe("One explicit wallet organization edit from current labels to new labels.");

const renameWalletsInputSchema = z
  .object({
    edits: z
      .array(walletEditSchema)
      .min(1)
      .describe("Batch of wallet organization edits. Each item must include explicit current and next labels."),
    updateLabelFiles: z
      .boolean()
      .default(true)
      .describe("Keep true to sync protected *.label.json sidecar files. This never changes secret key bytes."),
  })
  .strict()
  .describe(
    "Update wallet organization labels only. Use explicit current and next walletGroup/walletName pairs. This tool cannot create, delete, export, or sign with wallets.",
  );

type RenameWalletsInput = z.output<typeof renameWalletsInputSchema>;

interface RenameWalletsOutput {
  walletLibraryFilePath: string;
  updated: Array<{
    current: {
      walletId: string;
      walletGroup: string;
      walletName: string;
    };
    next: {
      walletId: string;
      walletGroup: string;
      walletName: string;
    };
    keypairFilePath?: string;
    walletLabelFilePath?: string;
    address?: string;
  }>;
}

interface PlannedWalletRename {
  sourceIndex: number;
  currentWalletId: string;
  nextWalletId: string;
  current: RenameWalletsInput["edits"][number]["current"];
  next: RenameWalletsInput["edits"][number]["next"];
  nextEntry: ManagedWalletLibraryEntry;
  keypairFilePath?: string;
  walletLabelFilePath?: string;
}

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

      const { entries, invalidLineCount } = await readManagedWalletLibraryEntries({ filePath: walletLibraryFilePath });
      if (invalidLineCount > 0) {
        throw new Error(`Wallet library contains ${invalidLineCount} invalid line(s): ${walletLibraryFilePath}`);
      }
      if (entries.length === 0) {
        throw new Error(`Wallet library file is empty: ${walletLibraryFilePath}`);
      }

      const entryIndexByWalletId = new Map<string, number>();
      entries.forEach((entry, index) => {
        const walletId = entry.walletId;
        if (entryIndexByWalletId.has(walletId)) {
          throw new Error(`Duplicate walletId in library: ${walletId}`);
        }
        entryIndexByWalletId.set(walletId, index);
      });

      const editPlans = input.edits.map((edit, index) => {
        const currentWalletId = toWalletId(edit.current.walletGroup, edit.current.walletName);
        const nextWalletId = toWalletId(edit.next.walletGroup, edit.next.walletName);
        const sourceIndex = entryIndexByWalletId.get(currentWalletId);
        if (sourceIndex === undefined) {
          throw new Error(`Cannot update missing wallet "${currentWalletId}"`);
        }
        return {
          index,
          currentWalletId,
          nextWalletId,
          sourceIndex,
          current: edit.current,
          next: edit.next,
        };
      });

      const seenCurrentWalletIds = new Set<string>();
      const seenNextWalletIds = new Set<string>();
      for (const plan of editPlans) {
        if (seenCurrentWalletIds.has(plan.currentWalletId)) {
          throw new Error(`Duplicate current wallet reference in edits: "${plan.currentWalletId}"`);
        }
        seenCurrentWalletIds.add(plan.currentWalletId);

        if (seenNextWalletIds.has(plan.nextWalletId)) {
          throw new Error(`Duplicate target wallet labels in edits: "${plan.nextWalletId}"`);
        }
        seenNextWalletIds.add(plan.nextWalletId);
      }

      for (const plan of editPlans) {
        const existingTargetIndex = entryIndexByWalletId.get(plan.nextWalletId);
        if (existingTargetIndex !== undefined && !seenCurrentWalletIds.has(plan.nextWalletId)) {
          throw new Error(`Cannot update "${plan.currentWalletId}" to "${plan.nextWalletId}": target already exists`);
        }
      }

      const plannedUpdates = editPlans.map((plan) => {
        const entry = entries[plan.sourceIndex];
        if (!entry) {
          throw new Error(`Wallet entry missing at library index ${plan.sourceIndex}`);
        }
        const next = { ...entry };

        next.walletId = plan.nextWalletId;
        next.walletGroup = plan.next.walletGroup;
        next.walletName = plan.next.walletName;
        next.updatedAt = new Date().toISOString();

        const keypairFilePath = typeof next.keypairFilePath === "string" ? next.keypairFilePath : undefined;
        const walletLabelFilePath = typeof next.walletLabelFilePath === "string"
          ? next.walletLabelFilePath
          : (keypairFilePath ? resolveWalletLabelFilePath(keypairFilePath) : undefined);
        if (walletLabelFilePath) {
          next.walletLabelFilePath = walletLabelFilePath;
        }

        return {
          sourceIndex: plan.sourceIndex,
          currentWalletId: plan.currentWalletId,
          nextWalletId: plan.nextWalletId,
          current: plan.current,
          next: plan.next,
          nextEntry: next,
          keypairFilePath,
          walletLabelFilePath,
        } satisfies PlannedWalletRename;
      });

      await Promise.all(
        plannedUpdates
          .filter((plan) => input.updateLabelFiles && plan.walletLabelFilePath)
          .map(async (plan) => {
            const absoluteWalletLabelFilePath = resolveAbsolutePath(plan.walletLabelFilePath!);
            assertWithinBrainProtectedDirectory(absoluteWalletLabelFilePath);
            await assertProtectedWriteAllowed({
              actor: _ctx.actor,
              targetPath: absoluteWalletLabelFilePath,
              operation: "rewrite wallet label metadata",
            });

            const walletLabelFile = Bun.file(absoluteWalletLabelFilePath);
            let nextWalletLabel: Record<string, unknown> = {};
            if (await walletLabelFile.exists()) {
              const walletLabelJson = await walletLabelFile.json();
              if (walletLabelJson && typeof walletLabelJson === "object" && !Array.isArray(walletLabelJson)) {
                nextWalletLabel = { ...(walletLabelJson as Record<string, unknown>) };
              }
            }

            nextWalletLabel.version = 1;
            nextWalletLabel.walletId = plan.nextWalletId;
            nextWalletLabel.walletGroup = plan.next.walletGroup;
            nextWalletLabel.walletName = plan.next.walletName;
            nextWalletLabel.address =
              typeof plan.nextEntry.address === "string" ? plan.nextEntry.address : nextWalletLabel.address;
            if (plan.keypairFilePath) {
              nextWalletLabel.walletFileName = path.basename(plan.keypairFilePath);
            }
            nextWalletLabel.updatedAt = new Date().toISOString();
            if (typeof nextWalletLabel.createdAt !== "string") {
              nextWalletLabel.createdAt =
                typeof plan.nextEntry.createdAt === "string" ? plan.nextEntry.createdAt : nextWalletLabel.updatedAt;
            }
            await Bun.write(absoluteWalletLabelFilePath, `${JSON.stringify(nextWalletLabel, null, 2)}\n`);
          }),
      );

      const nextEntries = [...entries];
      plannedUpdates.forEach((plan) => {
        nextEntries[plan.sourceIndex] = plan.nextEntry;
      });

      const updated = plannedUpdates.map((plan) => ({
          current: {
            walletId: plan.currentWalletId,
            walletGroup: plan.current.walletGroup,
            walletName: plan.current.walletName,
          },
          next: {
            walletId: plan.nextWalletId,
            walletGroup: plan.next.walletGroup,
            walletName: plan.next.walletName,
          },
          keypairFilePath: plan.keypairFilePath,
          walletLabelFilePath: plan.walletLabelFilePath,
          address: typeof plan.nextEntry.address === "string" ? plan.nextEntry.address : undefined,
        }));

      await assertProtectedWriteAllowed({
        actor: _ctx.actor,
        targetPath: walletLibraryFilePath,
        operation: "rewrite wallet library",
      });
      await rewriteManagedWalletLibraryEntries(walletLibraryFilePath, nextEntries);

      return {
        ok: true,
        retryable: false,
        data: {
          walletLibraryFilePath,
          updated,
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
