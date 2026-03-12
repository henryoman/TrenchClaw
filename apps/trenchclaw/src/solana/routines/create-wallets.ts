import { z } from "zod";

import type { ActionStep } from "../../ai/runtime/types/action";
import type { RoutinePlanner } from "../../ai/runtime/types/scheduler";

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

const createWalletsRoutineConfigSchema = z.object({
  walletGroups: z.array(walletGroupConfigSchema).optional(),
  renames: z.array(renameConfigSchema).optional(),
  storage: z
    .object({
      walletGroup: z.string().min(1).optional(),
      createGroupIfMissing: z.boolean().optional(),
    })
    .optional(),
})
  .catchall(z.unknown());

export const createWalletsRoutine: RoutinePlanner = async (_ctx, job) => {
  const config = createWalletsRoutineConfigSchema.parse(job.config);

  if (!config.walletGroups || config.walletGroups.length === 0) {
    return [
      {
        key: "create-wallets",
        actionName: "createWallets",
        input: config,
        idempotencyKey: `${job.id}:create-wallets`,
      },
    ];
  }

  const steps: ActionStep[] = [
    {
      key: "create-wallets:batch",
      actionName: "createWallets",
      input: {
        groups: config.walletGroups.map((walletGroup) => {
          const walletNames = walletGroup.wallets?.map((wallet) => wallet.name);
          return {
            walletGroup: walletGroup.name,
            ...(walletNames ? { walletNames } : { count: walletGroup.count ?? 1 }),
          };
        }),
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
