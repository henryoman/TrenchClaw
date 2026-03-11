import { z } from "zod";

import type { ActionStep } from "../../ai/runtime/types/action";
import type { RoutinePlanner } from "../../ai/runtime/types/scheduler";

const walletNameSchema = z.string().min(1);
const walletGroupConfigSchema = z.object({
  name: z.string().min(1),
  wallets: z.array(z.object({ name: walletNameSchema })).optional(),
  count: z.number().int().positive().optional(),
  startIndex: z.number().int().positive().optional(),
  filePrefix: z.string().min(1).optional(),
  includeIndexInFileName: z.boolean().optional(),
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
  output: z
    .object({
      filePrefix: z.string().min(1).optional(),
      startIndex: z.number().int().positive().optional(),
      includeIndexInFileName: z.boolean().optional(),
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

  const steps: ActionStep[] = config.walletGroups.map((walletGroup, index) => {
    const walletNames = walletGroup.wallets?.map((wallet) => wallet.name);
    const count = walletNames?.length ?? walletGroup.count ?? 1;

    return {
      key: `create-wallets:${walletGroup.name}:${index + 1}`,
      actionName: "createWallets",
      input: {
        count,
        ...(walletNames ? { walletNames } : {}),
        storage: {
          walletGroup: walletGroup.name,
          createGroupIfMissing: config.storage?.createGroupIfMissing ?? true,
        },
        output: {
          ...config.output,
          ...(walletGroup.filePrefix ? { filePrefix: walletGroup.filePrefix } : {}),
          ...(walletGroup.startIndex ? { startIndex: walletGroup.startIndex } : {}),
          ...(walletGroup.includeIndexInFileName !== undefined
            ? { includeIndexInFileName: walletGroup.includeIndexInFileName }
            : {}),
        },
      },
      idempotencyKey: `${job.id}:create-wallets:${walletGroup.name}`,
    };
  });

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
        walletGroup,
        renames,
      },
      idempotencyKey: `${job.id}:rename-wallets:${walletGroup}`,
    });
  }

  return steps;
};
