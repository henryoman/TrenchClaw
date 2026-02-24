import { createKeyPairFromPrivateKeyBytes, getAddressFromPublicKey } from "@solana/kit";
import path from "node:path";
import { z } from "zod";

import type { Action } from "../../../../ai/contracts/action";

const createWalletsInputSchema = z.object({
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

type CreateWalletsInput = z.output<typeof createWalletsInputSchema>;

interface CreatedWallet {
  address: string;
  publicKeyBytes: number[];
  privateKey?: string | number[];
  keypairFilePath?: string;
}

interface CreateWalletsOutput {
  wallets: CreatedWallet[];
  outputDirectory: string;
  files: string[];
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

export const createWalletsAction: Action<CreateWalletsInput, CreateWalletsOutput> = {
  name: "createWallets",
  category: "wallet-based",
  inputSchema: createWalletsInputSchema,
  async execute(_ctx, input) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();

    try {
      const wallets: CreatedWallet[] = [];
      const files: string[] = [];
      const outputDirectory = path.isAbsolute(input.output.directory)
        ? input.output.directory
        : path.join(process.cwd(), input.output.directory);

      await Bun.$`mkdir -p ${outputDirectory}`.quiet();

      for (let index = 0; index < input.count; index += 1) {
        const privateKeyBytes = crypto.getRandomValues(new Uint8Array(32));
        const keyPair = await createKeyPairFromPrivateKeyBytes(privateKeyBytes);
        const address = await getAddressFromPublicKey(keyPair.publicKey);
        const publicKeyBytes = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));

        let privateKey: string | number[] | undefined;
        if (input.includePrivateKey) {
          privateKey = encodePrivateKey(privateKeyBytes, input.privateKeyEncoding);
        }

        const baseName = input.output.includeIndexInFileName
          ? `${input.output.filePrefix}-${String(index + 1).padStart(4, "0")}`
          : `${input.output.filePrefix}-${String(address)}`;
        const keypairFilePath = path.join(outputDirectory, `${baseName}.json`);

        await Bun.write(
          keypairFilePath,
          `${JSON.stringify(
            {
              address: String(address),
              publicKeyBytes: Array.from(publicKeyBytes),
              privateKey,
            },
            null,
            2,
          )}\n`,
        );
        files.push(keypairFilePath);

        wallets.push({
          address: String(address),
          publicKeyBytes: Array.from(publicKeyBytes),
          privateKey,
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
