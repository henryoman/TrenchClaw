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
  resolveWalletLibraryFilePath,
  walletGroupNameSchema,
} from "./wallet-storage";

const walletSegmentSchema = z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/);

const walletLocatorSchema = z.object({
  group: walletSegmentSchema.optional(),
  wallet: walletSegmentSchema.optional(),
  startIndex: z.number().int().positive().default(1),
});

const createWalletsInputSchema = z.object({
  count: z.number().int().positive().max(100).default(1),
  includePrivateKey: z.boolean().default(true),
  privateKeyEncoding: z.enum(["base64", "hex", "bytes"]).default("base64"),
  walletPath: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/)
    .optional(),
  walletLocator: walletLocatorSchema.optional(),
  storage: z
    .object({
      walletGroup: walletGroupNameSchema.default(DEFAULT_WALLET_GROUP),
      createGroupIfMissing: z.boolean().default(true),
      keypairGenerator: z.enum(["bun", "solana-cli"]).default("bun"),
    })
    .default({
      walletGroup: DEFAULT_WALLET_GROUP,
      createGroupIfMissing: true,
      keypairGenerator: "bun",
    }),
  output: z
    .object({
      filePrefix: z.string().min(1).default("wallet"),
      includeIndexInFileName: z.boolean().default(true),
    })
    .default({
      filePrefix: "wallet",
      includeIndexInFileName: true,
    }),
});

type CreateWalletsInput = z.output<typeof createWalletsInputSchema>;

interface CreatedWallet {
  walletPath: string;
  address: string;
  publicKeyBytes: number[];
  keypairFilePath?: string;
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
  walletPath: string;
  group: string;
  wallet: string;
  address: string;
  walletGroup: string;
  walletFileName: string;
  keypairGenerator: "bun" | "solana-cli";
  createdAt: string;
  updatedAt: string;
}

const resolveWalletNaming = (
  input: CreateWalletsInput,
  effectiveWalletGroupForLocator: string,
  index: number,
): { group: string; wallet: string; walletPath: string } => {
  if (input.walletPath) {
    const [group, wallet] = input.walletPath.split(".");
    if (!group || !wallet) {
      throw new Error(`Invalid walletPath: ${input.walletPath}. Expected format group.wallet`);
    }

    if (input.count > 1) {
      return {
        group,
        wallet: `${wallet}-${String(index + 1).padStart(4, "0")}`,
        walletPath: `${group}.${wallet}-${String(index + 1).padStart(4, "0")}`,
      };
    }

    return { group, wallet, walletPath: input.walletPath };
  }

  const walletLocator = input.walletLocator;
  const group = walletLocator?.group ?? effectiveWalletGroupForLocator;

  if (walletLocator?.wallet && input.count === 1) {
    return { group, wallet: walletLocator.wallet, walletPath: `${group}.${walletLocator.wallet}` };
  }

  const indexValue = (walletLocator?.startIndex ?? 1) + index;
  const wallet = `${input.output.filePrefix}${String(indexValue).padStart(3, "0")}`;
  return { group, wallet, walletPath: `${group}.${wallet}` };
};

const parseSolanaSecretKeyArray = (value: unknown): number[] => {
  if (!Array.isArray(value) || value.length < 64) {
    throw new Error("solana-keygen output is not a valid keypair array");
  }

  const numeric = value.map((entry) => Number(entry));
  const allValid = numeric.every((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 255);
  if (!allValid) {
    throw new Error("solana-keygen output contains invalid key bytes");
  }
  return numeric;
};

const directoryExists = async (directoryPath: string): Promise<boolean> => {
  try {
    const metadata = await stat(directoryPath);
    return metadata.isDirectory();
  } catch {
    return false;
  }
};

const createWalletWithGenerator = async (input: {
  generator: "bun" | "solana-cli";
  keypairFilePath: string;
}): Promise<{ address: string; publicKeyBytes: Uint8Array; secretKeyBytes: number[] }> => {
  if (input.generator === "solana-cli") {
    try {
      await Bun.$`solana-keygen new --no-bip39-passphrase --silent --outfile ${input.keypairFilePath}`.quiet();
      const address = (await Bun.$`solana-keygen pubkey ${input.keypairFilePath}`.text()).trim();
      const secretKey = parseSolanaSecretKeyArray(await Bun.file(input.keypairFilePath).json());
      const publicKeyBytes = Uint8Array.from(secretKey.slice(32, 64));
      return {
        address,
        publicKeyBytes,
        secretKeyBytes: secretKey,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`solana-keygen wallet generation failed: ${message}`, { cause: error });
    }
  }

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

      const effectiveWalletGroupForLocator = input.walletLocator?.group ?? walletGroup;
      const createWalletAtIndex = async (index: number): Promise<void> => {
        if (index >= input.count) {
          return;
        }
        const { group, wallet, walletPath } = resolveWalletNaming(input, effectiveWalletGroupForLocator, index);

        const baseName = input.output.includeIndexInFileName
          ? `${group}-${wallet}-${String(index + 1).padStart(4, "0")}`
          : `${group}-${wallet}`;
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

        const generated = await createWalletWithGenerator({
          generator: input.storage.keypairGenerator,
          keypairFilePath,
        });
        if (input.storage.keypairGenerator === "bun") {
          await Bun.write(keypairFilePath, `${JSON.stringify(generated.secretKeyBytes)}\n`);
        }

        const createdAt = new Date().toISOString();
        const walletLabel: WalletLabelFile = {
          version: 1,
          walletPath,
          group,
          wallet,
          address: generated.address,
          walletGroup,
          walletFileName: path.basename(keypairFilePath),
          keypairGenerator: input.storage.keypairGenerator,
          createdAt,
          updatedAt: createdAt,
        };
        await Bun.write(walletLabelFilePath, `${JSON.stringify(walletLabel, null, 2)}\n`);

        await appendFile(
          walletLibraryFilePath,
          `${JSON.stringify({
            walletPath,
            group,
            wallet,
            address: generated.address,
            keypairFilePath,
            walletLabelFilePath,
            walletGroup,
            createdAt,
          })}\n`,
          { encoding: "utf8" },
        );

        files.push(keypairFilePath);

        wallets.push({
          walletPath,
          address: generated.address,
          publicKeyBytes: Array.from(generated.publicKeyBytes),
          keypairFilePath,
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
