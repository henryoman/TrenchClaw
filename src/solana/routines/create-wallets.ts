import { z } from "zod";

import type { RoutinePlanner } from "../../ai/contracts/scheduler";

const createWalletsRoutineConfigSchema = z.object({
  count: z.number().int().positive().max(100).default(1),
  includePrivateKey: z.boolean().default(true),
  privateKeyEncoding: z.enum(["base64", "hex", "bytes"]).default("base64"),
  walletPath: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/)
    .optional(),
  walletLocator: z
    .object({
      group: z.string().min(1).default("default"),
      wallet: z.string().min(1).optional(),
      startIndex: z.number().int().positive().default(1),
    })
    .default({
      group: "default",
      startIndex: 1,
    }),
  output: z
    .object({
      directory: z.string().min(1).default("src/ai/brain/protected/keypairs"),
      filePrefix: z.string().min(1).default("wallet"),
      includeIndexInFileName: z.boolean().default(true),
      walletLibraryFile: z.string().min(1).default("src/ai/brain/protected/wallet-library.jsonl"),
    })
    .default({
      directory: "src/ai/brain/protected/keypairs",
      filePrefix: "wallet",
      includeIndexInFileName: true,
      walletLibraryFile: "src/ai/brain/protected/wallet-library.jsonl",
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
        walletPath: config.walletPath,
        walletLocator: config.walletLocator,
        output: config.output,
      },
    },
  ];
};
