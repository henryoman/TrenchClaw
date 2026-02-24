import { z } from "zod";

import type { RoutinePlanner } from "../../ai/contracts/scheduler";

const createWalletsRoutineConfigSchema = z.object({
  count: z.number().int().positive().max(100).default(1),
  includePrivateKey: z.boolean().default(true),
  privateKeyEncoding: z.enum(["base64", "hex", "bytes"]).default("base64"),
  output: z
    .object({
      directory: z.string().min(1).default("src/brain/protected/keypairs"),
      filePrefix: z.string().min(1).default("wallet"),
      includeIndexInFileName: z.boolean().default(true),
    })
    .default({
      directory: "src/brain/protected/keypairs",
      filePrefix: "wallet",
      includeIndexInFileName: true,
    }),
});

export const createWalletsRoutine: RoutinePlanner = async (_ctx, job) => {
  const config = createWalletsRoutineConfigSchema.parse(job.config);

  return [
    {
      actionName: "createWallets",
      input: {
        count: config.count,
        includePrivateKey: config.includePrivateKey,
        privateKeyEncoding: config.privateKeyEncoding,
        output: config.output,
      },
    },
  ];
};
