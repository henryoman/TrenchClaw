import { createKeyPairFromPrivateKeyBytes, getAddressFromPublicKey } from "@solana/kit";
import { z } from "zod";

import type { Action } from "../../../../ai/contracts/action";

const createWalletsInputSchema = z.object({
  count: z.number().int().positive().max(100).default(1),
  includePrivateKey: z.boolean().default(true),
  privateKeyEncoding: z.enum(["base64", "hex", "bytes"]).default("base64"),
});

type CreateWalletsInput = z.output<typeof createWalletsInputSchema>;

interface CreatedWallet {
  address: string;
  publicKeyBytes: number[];
  privateKey?: string | number[];
}

interface CreateWalletsOutput {
  wallets: CreatedWallet[];
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

      for (let index = 0; index < input.count; index += 1) {
        const privateKeyBytes = crypto.getRandomValues(new Uint8Array(32));
        const keyPair = await createKeyPairFromPrivateKeyBytes(privateKeyBytes);
        const address = await getAddressFromPublicKey(keyPair.publicKey);
        const publicKeyBytes = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));

        let privateKey: string | number[] | undefined;
        if (input.includePrivateKey) {
          privateKey = encodePrivateKey(privateKeyBytes, input.privateKeyEncoding);
        }

        wallets.push({
          address: String(address),
          publicKeyBytes: Array.from(publicKeyBytes),
          privateKey,
        });
      }

      return {
        ok: true,
        retryable: false,
        data: { wallets },
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
