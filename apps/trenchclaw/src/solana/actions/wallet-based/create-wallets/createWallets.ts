import { createKeyPairFromPrivateKeyBytes, getAddressFromPublicKey } from "@solana/kit";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import type { Action } from "../../../../ai/runtime/types/action";
import {
  assertProtectedWriteAllowed,
  assertWithinBrainProtectedDirectory,
} from "../../../lib/wallet/protected-write-policy";
import {
  appendManagedWalletLibraryEntries,
  resolveWalletLibraryFilePath,
  resolveWalletGroupDirectoryPath,
  resolveWalletKeypairRootPath,
  resolveWalletLabelFilePath,
} from "../../../lib/wallet/wallet-manager";
import {
  DEFAULT_WALLET_GROUP,
  type ManagedWalletLibraryEntry,
  toWalletId,
  walletGroupNameSchema,
  type WalletLabelFile,
} from "../../../lib/wallet/wallet-types";

const MAX_WALLETS_PER_GROUP = 100;
const DEFAULT_WALLET_NAME_PREFIX = "wallet_";
const walletSegmentSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-zA-Z0-9_-]+$/)
  .describe("Flat wallet label. Use letters, numbers, underscores, or hyphens only.");

const walletGroupBatchSchema = z
  .object({
    walletGroup: walletGroupNameSchema.describe("Flat single-level wallet group name. No nested paths or slashes."),
    count: z
      .number()
      .int()
      .positive()
      .max(MAX_WALLETS_PER_GROUP)
      .optional()
      .describe(`How many wallets to create in this group. Maximum ${MAX_WALLETS_PER_GROUP}.`),
    walletNames: z
      .array(walletSegmentSchema)
      .min(1)
      .max(MAX_WALLETS_PER_GROUP)
      .optional()
      .describe("Optional explicit wallet names. If omitted, names default to wallet_000, wallet_001, wallet_002, ..."),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.walletNames && value.count === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide count or walletNames for each group.",
        path: ["count"],
      });
    }
    if (value.walletNames && value.count !== undefined && value.count !== value.walletNames.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `walletNames length (${value.walletNames.length}) must match count (${value.count})`,
        path: ["walletNames"],
      });
    }
    if (value.walletNames) {
      const seen = new Set<string>();
      for (const walletName of value.walletNames) {
        if (seen.has(walletName)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `walletNames contains duplicate value "${walletName}"`,
            path: ["walletNames"],
          });
          break;
        }
        seen.add(walletName);
      }
    }
  });

const createWalletsBatchInputSchema = z
  .object({
    groups: z
      .array(walletGroupBatchSchema)
      .min(1)
      .max(25)
      .describe("Flat wallet groups to create in one batch call. Each group can create up to 100 wallets."),
  })
  .strict()
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const [index, group] of value.groups.entries()) {
      if (seen.has(group.walletGroup)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate walletGroup "${group.walletGroup}" in groups array`,
          path: ["groups", index, "walletGroup"],
        });
      }
      seen.add(group.walletGroup);
    }
  })
  .describe(
    "Create wallets in one or more flat wallet groups. This is the preferred JSON shape for the model. Wallet files are created directly inside each group directory with no nested folders.",
  );

const legacyCreateWalletsInputSchema = z.object({
  count: z.number().int().positive().max(MAX_WALLETS_PER_GROUP).default(1),
  walletName: walletSegmentSchema.optional(),
  walletNames: z.array(walletSegmentSchema).min(1).max(MAX_WALLETS_PER_GROUP).optional(),
  storage: z
    .object({
      walletGroup: walletGroupNameSchema.default(DEFAULT_WALLET_GROUP),
      createGroupIfMissing: z.boolean().default(true),
    })
    .default({
      walletGroup: DEFAULT_WALLET_GROUP,
      createGroupIfMissing: true,
    }),
})
  .strict()
  .superRefine((value, ctx) => {
  if (value.walletName && value.count !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "walletName can only be used when count is 1",
      path: ["walletName"],
    });
  }

  if (value.walletNames && value.count !== value.walletNames.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `walletNames length (${value.walletNames.length}) must match count (${value.count})`,
      path: ["walletNames"],
    });
  }

  if (value.walletNames) {
    const seen = new Set<string>();
    for (const walletName of value.walletNames) {
      if (seen.has(walletName)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `walletNames contains duplicate value "${walletName}"`,
          path: ["walletNames"],
        });
        break;
      }
      seen.add(walletName);
    }
  }
});

const createWalletsExecutionInputSchema = z.union([createWalletsBatchInputSchema, legacyCreateWalletsInputSchema]);

type LegacyCreateWalletsInput = z.output<typeof legacyCreateWalletsInputSchema>;
type NormalizedCreateWalletsInput = z.output<typeof createWalletsBatchInputSchema>;

interface CreatedWallet {
  walletId: string;
  walletGroup: string;
  walletName: string;
  address: string;
  publicKeyBytes: number[];
  keypairFilePath: string;
  walletLabelFilePath: string;
}

interface CreateWalletsOutput {
  wallets: CreatedWallet[];
  groupDirectories: Array<{
    walletGroup: string;
    directoryPath: string;
  }>;
  outputDirectory?: string;
  files: string[];
  walletLibraryFilePath: string;
  walletGroup?: string;
}

const toDefaultWalletName = (index: number): string => `${DEFAULT_WALLET_NAME_PREFIX}${String(index).padStart(3, "0")}`;

const normalizeLegacyWalletNames = (input: LegacyCreateWalletsInput): string[] => {
  if (input.walletNames) {
    return input.walletNames;
  }

  if (input.walletName) {
    return [input.walletName];
  }

  return Array.from({ length: input.count }, (_, index) => toDefaultWalletName(index));
};

const normalizeCreateWalletsInput = (rawInput: unknown): NormalizedCreateWalletsInput => {
  const parsed = createWalletsExecutionInputSchema.parse(rawInput);
  if ("groups" in parsed) {
    return {
      groups: parsed.groups.map((group) => ({
        walletGroup: group.walletGroup,
        walletNames:
          group.walletNames
          ?? Array.from({ length: group.count ?? 1 }, (_, index) => toDefaultWalletName(index)),
      })),
    };
  }

  return {
    groups: [
      {
        walletGroup: parsed.storage.walletGroup,
        walletNames: normalizeLegacyWalletNames(parsed),
      },
    ],
  };
};

const createFilesystemWalletKeypair = async (): Promise<{
  address: string;
  publicKeyBytes: Uint8Array;
  secretKeyBytes: number[];
}> => {
  const seedPrivateKeyBytes = crypto.getRandomValues(new Uint8Array(32));
  const keyPair = await createKeyPairFromPrivateKeyBytes(seedPrivateKeyBytes);
  const address = await getAddressFromPublicKey(keyPair.publicKey);
  const publicKeyBytes = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
  const secretKeyBytes = [...seedPrivateKeyBytes, ...publicKeyBytes];

  return {
    address: String(address),
    publicKeyBytes,
    secretKeyBytes,
  };
};

const resolveNextWalletFilePath = async (outputDirectory: string): Promise<string> => {
  const entries = await readdir(outputDirectory, { withFileTypes: true }).catch(() => []);
  const usedNumericIndexes = new Set<number>();
  let existingWalletFileCount = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json") || entry.name.toLowerCase().endsWith(".label.json")) {
      continue;
    }
    existingWalletFileCount += 1;
    const numericMatch = /^wallet_(\d{3})\.json$/u.exec(entry.name);
    if (numericMatch?.[1]) {
      usedNumericIndexes.add(Number(numericMatch[1]));
    }
  }

  if (existingWalletFileCount >= MAX_WALLETS_PER_GROUP) {
    throw new Error(`Wallet group directory already contains the maximum of ${MAX_WALLETS_PER_GROUP} wallet files`);
  }

  for (let index = 0; index < MAX_WALLETS_PER_GROUP; index += 1) {
    if (!usedNumericIndexes.has(index)) {
      return path.join(outputDirectory, `wallet_${String(index).padStart(3, "0")}.json`);
    }
  }

  throw new Error(`No wallet file slots remain in ${outputDirectory}`);
};

export const createWalletsAction: Action<unknown, CreateWalletsOutput> = {
  name: "createWallets",
  category: "wallet-based",
  inputSchema: createWalletsBatchInputSchema,
  async execute(_ctx, rawInput) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();

    try {
      const input = normalizeCreateWalletsInput(rawInput);
      const wallets: CreatedWallet[] = [];
      const files: string[] = [];
      const walletLibraryFilePath = resolveWalletLibraryFilePath();
      const keypairRootPath = resolveWalletKeypairRootPath();
      const groupDirectories: CreateWalletsOutput["groupDirectories"] = [];

      assertWithinBrainProtectedDirectory(keypairRootPath);
      assertWithinBrainProtectedDirectory(walletLibraryFilePath);

      await assertProtectedWriteAllowed({
        actor: _ctx.actor,
        targetPath: keypairRootPath,
        operation: "prepare wallet keypair root directory",
      });
      await assertProtectedWriteAllowed({
        actor: _ctx.actor,
        targetPath: walletLibraryFilePath,
        operation: "append wallet library",
      });

      await Bun.$`mkdir -p ${path.dirname(walletLibraryFilePath)}`.quiet();
      const libraryEntries: ManagedWalletLibraryEntry[] = [];
      for (const groupInput of input.groups) {
        const outputDirectory = resolveWalletGroupDirectoryPath(groupInput.walletGroup);
        assertWithinBrainProtectedDirectory(outputDirectory);
        await assertProtectedWriteAllowed({ actor: _ctx.actor, targetPath: outputDirectory, operation: "create wallets" });

        await Bun.$`mkdir -p ${outputDirectory}`.quiet();
        groupDirectories.push({
          walletGroup: groupInput.walletGroup,
          directoryPath: outputDirectory,
        });

        const walletNames = groupInput.walletNames ?? [];
        if (walletNames.length > MAX_WALLETS_PER_GROUP) {
          throw new Error(`Wallet group "${groupInput.walletGroup}" exceeds the maximum of ${MAX_WALLETS_PER_GROUP} wallets`);
        }

        for (const wallet of walletNames) {
          const walletId = toWalletId(groupInput.walletGroup, wallet);
          const keypairFilePath = await resolveNextWalletFilePath(outputDirectory);
          const walletLabelFilePath = resolveWalletLabelFilePath(keypairFilePath);

          if (await Bun.file(keypairFilePath).exists()) {
            throw new Error(`Refusing to overwrite existing wallet file: ${keypairFilePath}`);
          }
          if (await Bun.file(walletLabelFilePath).exists()) {
            throw new Error(`Refusing to overwrite existing wallet label file: ${walletLabelFilePath}`);
          }

          await assertProtectedWriteAllowed({
            actor: _ctx.actor,
            targetPath: keypairFilePath,
            operation: "write keypair file",
          });
          await assertProtectedWriteAllowed({
            actor: _ctx.actor,
            targetPath: walletLabelFilePath,
            operation: "write wallet label file",
          });

          const generated = await createFilesystemWalletKeypair();
          await Bun.write(keypairFilePath, `${JSON.stringify(generated.secretKeyBytes)}\n`);

          const createdAt = new Date().toISOString();
          const walletLabel: WalletLabelFile = {
            version: 1,
            walletId,
            walletGroup: groupInput.walletGroup,
            walletName: wallet,
            address: generated.address,
            walletFileName: path.basename(keypairFilePath),
            createdAt,
            updatedAt: createdAt,
          };
          await Bun.write(walletLabelFilePath, `${JSON.stringify(walletLabel, null, 2)}\n`);

          libraryEntries.push({
            walletId,
            walletGroup: groupInput.walletGroup,
            walletName: wallet,
            address: generated.address,
            keypairFilePath,
            walletLabelFilePath,
            createdAt,
            updatedAt: createdAt,
          });

          files.push(keypairFilePath);
          wallets.push({
            walletId,
            walletGroup: groupInput.walletGroup,
            walletName: wallet,
            address: generated.address,
            publicKeyBytes: Array.from(generated.publicKeyBytes),
            keypairFilePath,
            walletLabelFilePath,
          });
        }
      }

      await appendManagedWalletLibraryEntries(walletLibraryFilePath, libraryEntries);

      return {
        ok: true,
        retryable: false,
        data: {
          wallets,
          groupDirectories,
          outputDirectory: groupDirectories.length === 1 ? groupDirectories[0]?.directoryPath : undefined,
          files,
          walletLibraryFilePath,
          walletGroup: groupDirectories.length === 1 ? groupDirectories[0]?.walletGroup : undefined,
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
        code: "CREATE_WALLETS_FAILED",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }
  },
};
