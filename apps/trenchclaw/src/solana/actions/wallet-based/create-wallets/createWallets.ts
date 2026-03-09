import { createKeyPairFromPrivateKeyBytes, getAddressFromPublicKey } from "@solana/kit";
import { appendFile, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import type { Action } from "../../../../ai/runtime/types/action";
import {
  assertProtectedWriteAllowed,
  assertWithinBrainProtectedDirectory,
} from "../../../lib/wallet/protected-write-policy";
import {
  DEFAULT_WALLET_GROUP,
  resolveWalletGroupDirectoryPath,
  resolveWalletKeypairRootPath,
  resolveWalletLabelFilePath,
  toWalletId,
  resolveWalletLibraryFilePath,
  walletGroupNameSchema,
} from "./wallet-storage";

const walletSegmentSchema = z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/);

const createWalletsInputSchema = z.object({
  count: z.number().int().positive().max(100).default(1),
  walletName: walletSegmentSchema.optional(),
  walletNames: z.array(walletSegmentSchema).min(1).max(100).optional(),
  storage: z
    .object({
      walletGroup: walletGroupNameSchema.default(DEFAULT_WALLET_GROUP),
      createGroupIfMissing: z.boolean().default(true),
    })
    .default({
      walletGroup: DEFAULT_WALLET_GROUP,
      createGroupIfMissing: true,
    }),
  output: z
    .object({
      filePrefix: z.string().min(1).default("wallet"),
      startIndex: z.number().int().positive().default(1),
      includeIndexInFileName: z.boolean().default(true),
    })
    .default({
      filePrefix: "wallet",
      startIndex: 1,
      includeIndexInFileName: true,
    }),
}).superRefine((value, ctx) => {
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

type CreateWalletsInput = z.output<typeof createWalletsInputSchema>;

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
  outputDirectory: string;
  files: string[];
  walletLibraryFilePath: string;
  walletGroup: string;
}

interface WalletLabelFile {
  version: 1;
  walletId: string;
  walletGroup: string;
  walletName: string;
  address: string;
  walletFileName: string;
  createdAt: string;
  updatedAt: string;
}

const resolveWalletName = (input: CreateWalletsInput, index: number): string => {
  if (input.walletNames) {
    const walletName = input.walletNames[index];
    if (!walletName) {
      throw new Error(`Missing wallet name for index ${index}`);
    }
    return walletName;
  }

  if (input.walletName) {
    return input.walletName;
  }

  const indexValue = input.output.startIndex + index;
  return `${input.output.filePrefix}${String(indexValue).padStart(3, "0")}`;
};

const directoryExists = async (directoryPath: string): Promise<boolean> => {
  try {
    const metadata = await stat(directoryPath);
    return metadata.isDirectory();
  } catch {
    return false;
  }
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

export const createWalletsAction: Action<CreateWalletsInput, CreateWalletsOutput> = {
  name: "createWallets",
  category: "wallet-based",
  inputSchema: createWalletsInputSchema,
  async execute(_ctx, rawInput) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();

    try {
      const input = createWalletsInputSchema.parse(rawInput);
      const wallets: CreatedWallet[] = [];
      const files: string[] = [];

      const walletGroup = input.storage.walletGroup;
      const keypairRootPath = resolveWalletKeypairRootPath();
      const outputDirectory = resolveWalletGroupDirectoryPath(walletGroup);
      const walletLibraryFilePath = resolveWalletLibraryFilePath();

      assertWithinBrainProtectedDirectory(keypairRootPath);
      assertWithinBrainProtectedDirectory(outputDirectory);
      assertWithinBrainProtectedDirectory(walletLibraryFilePath);

      await assertProtectedWriteAllowed({
        actor: _ctx.actor,
        targetPath: keypairRootPath,
        operation: "prepare wallet keypair root directory",
      });
      await assertProtectedWriteAllowed({ actor: _ctx.actor, targetPath: outputDirectory, operation: "create wallets" });
      await assertProtectedWriteAllowed({
        actor: _ctx.actor,
        targetPath: walletLibraryFilePath,
        operation: "append wallet library",
      });

      if (input.storage.createGroupIfMissing) {
        await Bun.$`mkdir -p ${outputDirectory}`.quiet();
      } else if (!(await directoryExists(outputDirectory))) {
        throw new Error(`Wallet group directory does not exist: ${outputDirectory}`);
      }

      await Bun.$`mkdir -p ${path.dirname(walletLibraryFilePath)}`.quiet();

      const createWalletAtIndex = async (index: number): Promise<void> => {
        if (index >= input.count) {
          return;
        }
        const group = walletGroup;
        const wallet = resolveWalletName(input, index);
        const walletId = toWalletId(group, wallet);

        const baseName = input.output.includeIndexInFileName
          ? `${wallet}-${String(input.output.startIndex + index).padStart(4, "0")}`
          : wallet;
        const keypairFilePath = path.join(outputDirectory, `${baseName}.json`);
        const walletLabelFilePath = resolveWalletLabelFilePath(keypairFilePath);

        if (await Bun.file(keypairFilePath).exists()) {
          throw new Error(`Refusing to overwrite existing wallet file: ${keypairFilePath}`);
        }
        if (await Bun.file(walletLabelFilePath).exists()) {
          throw new Error(`Refusing to overwrite existing wallet label file: ${walletLabelFilePath}`);
        }
        await assertProtectedWriteAllowed({ actor: _ctx.actor, targetPath: keypairFilePath, operation: "write keypair file" });
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
          walletGroup: group,
          walletName: wallet,
          address: generated.address,
          walletFileName: path.basename(keypairFilePath),
          createdAt,
          updatedAt: createdAt,
        };
        await Bun.write(walletLabelFilePath, `${JSON.stringify(walletLabel, null, 2)}\n`);

        await appendFile(
          walletLibraryFilePath,
          `${JSON.stringify({
            walletId,
            walletGroup: group,
            walletName: wallet,
            address: generated.address,
            keypairFilePath,
            walletLabelFilePath,
            createdAt,
            updatedAt: createdAt,
          })}\n`,
          { encoding: "utf8" },
        );

        files.push(keypairFilePath);

        wallets.push({
          walletId,
          walletGroup: group,
          walletName: wallet,
          address: generated.address,
          publicKeyBytes: Array.from(generated.publicKeyBytes),
          keypairFilePath,
          walletLabelFilePath,
        });
        await createWalletAtIndex(index + 1);
      };

      await createWalletAtIndex(0);

      return {
        ok: true,
        retryable: false,
        data: {
          wallets,
          outputDirectory,
          files,
          walletLibraryFilePath,
          walletGroup,
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
