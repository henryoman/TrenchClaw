import { z } from "zod";

import type { RoutinePlanner } from "../../ai/runtime/types/scheduler";

const createWalletsRoutineConfigSchema = z.record(z.string(), z.unknown());

export const createWalletsRoutine: RoutinePlanner = async (_ctx, job) => {
  const config = createWalletsRoutineConfigSchema.parse(job.config);

  return [
    {
      key: "create-wallets",
      actionName: "createWallets",
      input: config,
      idempotencyKey: `${job.id}:create-wallets`,
    },
  ];
};
