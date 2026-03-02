import { createKeyPairFromPrivateKeyBytes, getAddressFromPublicKey } from "@solana/kit";
import { appendFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import type { Action } from "../../../../ai/runtime/types/action";
import {
  assertProtectedWriteAllowed,
  assertWithinBrainProtectedDirectory,
  resolveAbsolutePath,
} from "../../../lib/wallet/protected-write-policy";
import {
  DEFAULT_WALLET_GROUP,
  DEFAULT_WALLET_LIBRARY_PATH,
  resolveWalletGroupDirectoryPath,
  resolveWalletKeypairRootPath,
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
      walletLibraryFile: z.string().min(1).default(DEFAULT_WALLET_LIBRARY_PATH),
      keypairGenerator: z.enum(["bun", "solana-cli"]).default("bun"),
    })
    .default({
      walletGroup: DEFAULT_WALLET_GROUP,
      createGroupIfMissing: true,
      walletLibraryFile: DEFAULT_WALLET_LIBRARY_PATH,
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

const encodePrivateKey = (privateKeyBytes: Uint8Array, encoding: CreateWalletsInput["privateKeyEncoding"]) => {
  if (encoding === "bytes") {
    return Array.from(privateKeyBytes);
  }
  if (encoding === "hex") {
    return Buffer.from(privateKeyBytes).toString("hex");
  }
  return Buffer.from(privateKeyBytes).toString("base64");
};

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

const createWalletWithGenerator = async (input: {
  generator: "bun" | "solana-cli";
  keypairFilePath: string;
}): Promise<{ address: string; publicKeyBytes: Uint8Array; privateKeyBytes: Uint8Array }> => {
  if (input.generator === "solana-cli") {
    try {
      await Bun.$`solana-keygen new --no-bip39-passphrase --silent --outfile ${input.keypairFilePath}`.quiet();
      const address = (await Bun.$`solana-keygen pubkey ${input.keypairFilePath}`.text()).trim();
      const secretKey = parseSolanaSecretKeyArray(await Bun.file(input.keypairFilePath).json());
      const privateKeyBytes = Uint8Array.from(secretKey);
      const publicKeyBytes = Uint8Array.from(secretKey.slice(32, 64));
      return {
        address,
        publicKeyBytes,
        privateKeyBytes,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`solana-keygen wallet generation failed: ${message}`);
    }
  }

  const seedPrivateKeyBytes = crypto.getRandomValues(new Uint8Array(32));
  const keyPair = await createKeyPairFromPrivateKeyBytes(seedPrivateKeyBytes);
  const address = await getAddressFromPublicKey(keyPair.publicKey);
  const publicKeyBytes = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));

  return {
    address: String(address),
    publicKeyBytes,
    privateKeyBytes: seedPrivateKeyBytes,
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
      const walletLibraryFilePath = resolveAbsolutePath(input.storage.walletLibraryFile);

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
      } else if (!(await Bun.file(outputDirectory).exists())) {
        throw new Error(`Wallet group directory does not exist: ${outputDirectory}`);
      }

      await Bun.$`mkdir -p ${path.dirname(walletLibraryFilePath)}`.quiet();

      const effectiveWalletGroupForLocator = input.walletLocator?.group ?? walletGroup;

      for (let index = 0; index < input.count; index += 1) {
        const { group, wallet, walletPath } = resolveWalletNaming(input, effectiveWalletGroupForLocator, index);

        const baseName = input.output.includeIndexInFileName
          ? `${group}-${wallet}-${String(index + 1).padStart(4, "0")}`
          : `${group}-${wallet}`;
        const keypairFilePath = path.join(outputDirectory, `${baseName}.json`);

        if (await Bun.file(keypairFilePath).exists()) {
          throw new Error(`Refusing to overwrite existing wallet file: ${keypairFilePath}`);
        }
        await assertProtectedWriteAllowed({ actor: _ctx.actor, targetPath: keypairFilePath, operation: "write keypair file" });

        const generated = await createWalletWithGenerator({
          generator: input.storage.keypairGenerator,
          keypairFilePath,
        });

        const privateKey = input.includePrivateKey
          ? encodePrivateKey(generated.privateKeyBytes, input.privateKeyEncoding)
          : undefined;

        await Bun.write(
          keypairFilePath,
          `${JSON.stringify(
            {
              walletPath,
              address: generated.address,
              publicKeyBytes: Array.from(generated.publicKeyBytes),
              privateKey,
              keypairGenerator: input.storage.keypairGenerator,
            },
            null,
            2,
          )}\n`,
        );

        await appendFile(
          walletLibraryFilePath,
          `${JSON.stringify({
            walletPath,
            group,
            wallet,
            address: generated.address,
            keypairFilePath,
            walletGroup,
            createdAt: new Date().toISOString(),
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
      }

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
