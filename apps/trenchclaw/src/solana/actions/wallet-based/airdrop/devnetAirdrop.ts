import { z } from "zod";

import type { Action } from "../../../../ai/runtime/types/action";
import { readManagedWalletLibraryEntries } from "../../../lib/wallet/wallet-manager";
import { base58AddressSchema, walletGroupNameSchema, walletNameSchema } from "../../../lib/wallet/wallet-types";

const devnetAirdropInputSchema = z
  .object({
    walletGroup: walletGroupNameSchema.optional(),
    walletNames: z.array(walletNameSchema).min(1).optional(),
    addresses: z.array(base58AddressSchema).min(1).optional(),
    amountSol: z.number().positive(),
  })
  .superRefine((input, ctx) => {
    if (!input.walletGroup && !input.addresses) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide "walletGroup" or "addresses" for devnet airdrops.',
        path: ["walletGroup"],
      });
    }
  });

type DevnetAirdropInput = z.output<typeof devnetAirdropInputSchema>;

interface DevnetAirdropOutput {
  rpcUrl: string;
  amountSol: number;
  amountLamports: number;
  recipients: Array<{
    address: string;
    walletGroup?: string;
    walletName?: string;
    signature: string;
  }>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const postRpc = async (rpcUrl: string, body: Record<string, unknown>): Promise<unknown> => {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`RPC request failed with status ${response.status}`);
  }
  if (isRecord(payload) && payload.error) {
    throw new Error(typeof payload.error === "string" ? payload.error : JSON.stringify(payload.error));
  }
  return payload;
};

const resolveRecipients = async (input: DevnetAirdropInput): Promise<Array<{
  address: string;
  walletGroup?: string;
  walletName?: string;
}>> => {
  const recipients = new Map<string, { address: string; walletGroup?: string; walletName?: string }>();

  for (const address of input.addresses ?? []) {
    recipients.set(address, { address });
  }

  if (input.walletGroup) {
    const { entries } = await readManagedWalletLibraryEntries({ inferFromFilesystem: true, allowMissing: true });
    const requestedWalletNames = input.walletNames ? new Set(input.walletNames) : null;
    for (const entry of entries) {
      if (entry.walletGroup !== input.walletGroup) {
        continue;
      }
      if (requestedWalletNames && !requestedWalletNames.has(entry.walletName)) {
        continue;
      }
      recipients.set(entry.address, {
        address: entry.address,
        walletGroup: entry.walletGroup,
        walletName: entry.walletName,
      });
    }
  }

  return [...recipients.values()];
};

export const devnetAirdropAction: Action<DevnetAirdropInput, DevnetAirdropOutput> = {
  name: "devnetAirdrop",
  category: "wallet-based",
  inputSchema: devnetAirdropInputSchema,
  async execute(ctx, rawInput) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();

    try {
      if (!ctx.rpcUrl) {
        throw new Error("Missing rpcUrl in action context");
      }
      const recipients = await resolveRecipients(rawInput);
      if (recipients.length === 0) {
        throw new Error("No devnet airdrop recipients resolved from the provided input");
      }

      const amountLamports = Math.trunc(rawInput.amountSol * 1_000_000_000);
      if (amountLamports <= 0) {
        throw new Error("amountSol must resolve to a positive lamport value");
      }

      const airdropResults = await Promise.all(
        recipients.map(async (recipient, index) => {
          const payload = await postRpc(ctx.rpcUrl!, {
            jsonrpc: "2.0",
            id: index + 1,
            method: "requestAirdrop",
            params: [recipient.address, amountLamports],
          });
          const result = isRecord(payload) ? payload.result : undefined;
          if (typeof result !== "string" || result.length === 0) {
            throw new Error(`Airdrop RPC response is missing a signature for ${recipient.address}`);
          }
          return Object.assign({}, recipient, { signature: result });
        }),
      );

      return {
        ok: true,
        retryable: false,
        data: {
          rpcUrl: ctx.rpcUrl,
          amountSol: rawInput.amountSol,
          amountLamports,
          recipients: airdropResults,
        },
        txSignature: airdropResults[0]?.signature,
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    } catch (error) {
      return {
        ok: false,
        retryable: false,
        error: error instanceof Error ? error.message : String(error),
        code: "DEVNET_AIRDROP_FAILED",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }
  },
};
