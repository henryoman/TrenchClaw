import { z } from "zod";

import type { ActionStep } from "../../ai/runtime/types/action";
import type { RoutinePlanner } from "../../ai/runtime/types/scheduler";

const walletSegmentSchema = z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/);

const outputSchema = z
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
  });

const namedWalletSchema = z.object({
  name: walletSegmentSchema,
});

type WalletGroupNode = {
  name: string;
  wallets?: Array<{ name: string }>;
  count?: number;
  startIndex?: number;
  filePrefix?: string;
  children?: WalletGroupNode[];
};

const walletGroupNodeSchema: z.ZodType<WalletGroupNode> = z.lazy(() =>
  z
    .object({
      name: walletSegmentSchema,
      wallets: z.array(namedWalletSchema).optional(),
      count: z.number().int().positive().optional(),
      startIndex: z.number().int().positive().default(1),
      filePrefix: z.string().min(1).optional(),
      children: z.array(walletGroupNodeSchema).default([]),
    })
    .superRefine((value, ctx) => {
      const hasWallets = Boolean(value.wallets?.length);
      const hasCount = typeof value.count === "number";
      const hasChildren = Boolean(value.children?.length);

      if (!hasWallets && !hasCount && !hasChildren) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Group node must provide wallets, count, or children",
          path: ["name"],
        });
      }
    }),
);

const renameSchema = z.object({
  from: z.string().trim().regex(/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/),
  to: z.string().trim().regex(/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/),
});

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
  output: outputSchema,
  groups: z.array(walletGroupNodeSchema).optional(),
  renames: z.array(renameSchema).optional(),
});

type CreateWalletsRoutineConfig = z.output<typeof createWalletsRoutineConfigSchema>;

const buildCreateStep = (
  config: CreateWalletsRoutineConfig,
  input: {
    count?: number;
    walletPath?: string;
    walletLocator?: {
      group: string;
      wallet?: string;
      startIndex?: number;
    };
    filePrefix?: string;
  },
): ActionStep => ({
  actionName: "createWallets",
  input: {
    count: input.count ?? 1,
    includePrivateKey: config.includePrivateKey,
    privateKeyEncoding: config.privateKeyEncoding,
    walletPath: input.walletPath,
    walletLocator: input.walletLocator,
    output: {
      ...config.output,
      filePrefix: input.filePrefix ?? config.output.filePrefix,
    },
  },
});

const flattenGroupSteps = (
  config: CreateWalletsRoutineConfig,
  groups: WalletGroupNode[],
  parentSegments: string[] = [],
): ActionStep[] => {
  const steps: ActionStep[] = [];

  for (const group of groups) {
    const groupSegments = [...parentSegments, group.name];
    const groupName = groupSegments.join("_");

    if (group.wallets?.length) {
      for (const wallet of group.wallets) {
        steps.push(
          buildCreateStep(config, {
            walletPath: `${groupName}.${wallet.name}`,
          }),
        );
      }
    }

    if (typeof group.count === "number") {
      steps.push(
        buildCreateStep(config, {
          count: group.count,
          filePrefix: group.filePrefix,
          walletLocator: {
            group: groupName,
            startIndex: group.startIndex,
          },
        }),
      );
    }

    if (group.children?.length) {
      steps.push(...flattenGroupSteps(config, group.children, groupSegments));
    }
  }

  return steps;
};

export const createWalletsRoutine: RoutinePlanner = async (_ctx, job) => {
  const config = createWalletsRoutineConfigSchema.parse(job.config);
  const steps: ActionStep[] = [];

  if (config.groups?.length) {
    steps.push(...flattenGroupSteps(config, config.groups));
  } else {
    steps.push(
      buildCreateStep(config, {
        count: config.count,
        walletPath: config.walletPath,
        walletLocator: config.walletLocator,
      }),
    );
  }

  if (config.renames?.length) {
    steps.push({
      actionName: "renameWallets",
      input: {
        walletLibraryFile: config.output.walletLibraryFile,
        renames: config.renames,
        updateKeypairFiles: true,
      },
    });
  }

  return steps;
};
