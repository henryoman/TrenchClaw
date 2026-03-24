import { z } from "zod";

import type { ActionStep } from "../../ai/contracts/types/action";
import type { RoutinePlanner } from "../../ai/contracts/types/scheduler";

const walletNameSchema = z.string().min(1);
const walletGroupConfigSchema = z.object({
  name: z.string().min(1),
  wallets: z.array(z.object({ name: walletNameSchema })).optional(),
  count: z.number().int().positive().optional(),
});

const renameConfigSchema = z.object({
  walletGroup: z.string().min(1),
  fromWalletName: walletNameSchema,
  toWalletName: walletNameSchema,
});

const createWalletGroupBatchSchema = z.object({
  walletGroup: z.string().min(1),
  count: z.number().int().positive().optional(),
  walletNames: z.array(walletNameSchema).min(1).optional(),
});

const createWalletsRoutineConfigSchema = z.object({
  groups: z.array(createWalletGroupBatchSchema).optional(),
  walletGroups: z.array(walletGroupConfigSchema).optional(),
  renames: z.array(renameConfigSchema).optional(),
})
  .catchall(z.unknown());

export const createWalletsRoutine: RoutinePlanner = async (_ctx, job) => {
  const config = createWalletsRoutineConfigSchema.parse(job.config);
  const groups = config.groups
    ?? config.walletGroups?.map((walletGroup) => {
      const walletNames = walletGroup.wallets?.map((wallet) => wallet.name);
      return {
        walletGroup: walletGroup.name,
        ...(walletNames ? { walletNames } : { count: walletGroup.count ?? 1 }),
      };
    });

  if (!groups || groups.length === 0) {
    throw new Error("createWallets routine requires groups or walletGroups");
  }

  const steps: ActionStep[] = [
    {
      key: "create-wallets:batch",
      actionName: "createWallets",
      input: {
        groups,
      },
      idempotencyKey: `${job.id}:create-wallets:batch`,
    },
  ];

  const renamesByGroup = new Map<string, Array<{ fromWalletName: string; toWalletName: string }>>();
  for (const rename of config.renames ?? []) {
    const existing = renamesByGroup.get(rename.walletGroup) ?? [];
    existing.push({
      fromWalletName: rename.fromWalletName,
      toWalletName: rename.toWalletName,
    });
    renamesByGroup.set(rename.walletGroup, existing);
  }

  for (const [walletGroup, renames] of renamesByGroup) {
    steps.push({
      key: `rename-wallets:${walletGroup}`,
      actionName: "renameWallets",
      input: {
        edits: renames.map((rename) => ({
          current: {
            walletGroup,
            walletName: rename.fromWalletName,
          },
          next: {
            walletGroup,
            walletName: rename.toWalletName,
          },
        })),
      },
      idempotencyKey: `${job.id}:rename-wallets:${walletGroup}`,
    });
  }

  return steps;
};
