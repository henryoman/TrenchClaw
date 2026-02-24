import { createKeyPairFromPrivateKeyBytes, getAddressFromPublicKey } from "@solana/kit";
import { appendFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import type { Action } from "../../../../ai/contracts/action";

const protectedRootDirectory = path.join(process.cwd(), "src/brain/protected");
const defaultKeyDirectory = "src/brain/protected/keypairs";
const defaultWalletLibraryPath = "src/brain/protected/wallet-library.jsonl";

const walletLocatorSchema = z
  .object({
    group: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/).default("default"),
    wallet: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/).optional(),
    startIndex: z.number().int().positive().default(1),
  })
  .default({
    group: "default",
    startIndex: 1,
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
  walletLocator: walletLocatorSchema,
  output: z
    .object({
      directory: z.string().min(1).default(defaultKeyDirectory),
      filePrefix: z.string().min(1).default("wallet"),
      includeIndexInFileName: z.boolean().default(true),
      walletLibraryFile: z.string().min(1).default(defaultWalletLibraryPath),
    })
    .default({
      directory: defaultKeyDirectory,
      filePrefix: "wallet",
      includeIndexInFileName: true,
      walletLibraryFile: defaultWalletLibraryPath,
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

const toAbsolutePath = (targetPath: string): string =>
  path.isAbsolute(targetPath) ? targetPath : path.join(process.cwd(), targetPath);

const assertWithinProtectedDirectory = (targetPath: string): void => {
  const normalizedTarget = path.resolve(targetPath);
  const normalizedProtectedRoot = path.resolve(protectedRootDirectory);

  if (
    normalizedTarget !== normalizedProtectedRoot &&
    !normalizedTarget.startsWith(`${normalizedProtectedRoot}${path.sep}`)
  ) {
    throw new Error(
      `Wallet files must be stored under ${normalizedProtectedRoot}. Received: ${normalizedTarget}`,
    );
  }
};

const resolveWalletNaming = (input: CreateWalletsInput, index: number): { group: string; wallet: string; walletPath: string } => {
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

  const group = input.walletLocator.group;
  if (input.walletLocator.wallet && input.count === 1) {
    return { group, wallet: input.walletLocator.wallet, walletPath: `${group}.${input.walletLocator.wallet}` };
  }

  const indexValue = input.walletLocator.startIndex + index;
  const wallet = `${input.output.filePrefix}${String(indexValue).padStart(3, "0")}`;
  return { group, wallet, walletPath: `${group}.${wallet}` };
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
      const outputDirectory = toAbsolutePath(input.output.directory);
      const walletLibraryFilePath = toAbsolutePath(input.output.walletLibraryFile);

      assertWithinProtectedDirectory(outputDirectory);
      assertWithinProtectedDirectory(walletLibraryFilePath);

      await Bun.$`mkdir -p ${outputDirectory}`.quiet();
      await Bun.$`mkdir -p ${path.dirname(walletLibraryFilePath)}`.quiet();

      for (let index = 0; index < input.count; index += 1) {
        const privateKeyBytes = crypto.getRandomValues(new Uint8Array(32));
        const keyPair = await createKeyPairFromPrivateKeyBytes(privateKeyBytes);
        const address = await getAddressFromPublicKey(keyPair.publicKey);
        const publicKeyBytes = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));

        const { group, wallet, walletPath } = resolveWalletNaming(input, index);

        const baseName = input.output.includeIndexInFileName
          ? `${group}-${wallet}-${String(index + 1).padStart(4, "0")}`
          : `${group}-${wallet}-${String(address)}`;
        const keypairFilePath = path.join(outputDirectory, `${baseName}.json`);

        if (await Bun.file(keypairFilePath).exists()) {
          throw new Error(`Refusing to overwrite existing wallet file: ${keypairFilePath}`);
        }

        const privateKey = input.includePrivateKey
          ? encodePrivateKey(privateKeyBytes, input.privateKeyEncoding)
          : undefined;

        await Bun.write(
          keypairFilePath,
          `${JSON.stringify(
            {
              walletPath,
              address: String(address),
              publicKeyBytes: Array.from(publicKeyBytes),
              privateKey,
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
            address: String(address),
            keypairFilePath,
            createdAt: new Date().toISOString(),
          })}\n`,
          { encoding: "utf8" },
        );

        files.push(keypairFilePath);

        wallets.push({
          walletPath,
          address: String(address),
          publicKeyBytes: Array.from(publicKeyBytes),
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
