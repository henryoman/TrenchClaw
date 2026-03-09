import { parseArgs } from "node:util";
import { z } from "zod";

import type { Action } from "../../../../../ai/runtime/types/action";
import { resolveWalletLibraryFilePath, walletGroupNameSchema } from "../create-wallets/wallet-storage";

const DEVNET_RPC_URL = "https://api.devnet.solana.com";
const LAMPORTS_PER_SOL = 1_000_000_000;
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_COMMITMENT = "confirmed";

const walletNameSchema = z.string().trim().regex(/^[a-zA-Z0-9_-]+$/);
const base58AddressSchema = z.string().trim().min(32).max(44).regex(/^[1-9A-HJ-NP-Za-km-z]+$/);
const walletLibraryEntrySchema = z.object({
  walletGroup: walletGroupNameSchema,
  walletName: walletNameSchema,
  address: base58AddressSchema,
});

type CommitmentLevel = "processed" | "confirmed" | "finalized";

interface TargetWallet {
  address: string;
  label: string;
}

const commitmentSchema = z.enum(["processed", "confirmed", "finalized"]);
const devnetAirdropInputSchema = z
  .object({
    addresses: z.array(base58AddressSchema).optional(),
    walletGroup: walletGroupNameSchema.optional(),
    walletNames: z.array(walletNameSchema).optional(),
    amountSol: z.union([z.number().positive(), z.string().trim().min(1)]).default(2),
    rpcUrl: z.string().trim().min(1).optional(),
    timeoutMs: z.number().int().positive().max(300_000).default(DEFAULT_TIMEOUT_MS),
    commitment: commitmentSchema.default(DEFAULT_COMMITMENT),
  })
  .superRefine((value, ctx) => {
    if ((!value.addresses || value.addresses.length === 0) && !value.walletGroup) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide at least one address or a walletGroup",
        path: ["addresses"],
      });
    }
  });

type DevnetAirdropInput = z.output<typeof devnetAirdropInputSchema>;

interface DevnetAirdropTargetResult {
  address: string;
  label: string;
  signature: string;
  balanceSol: number;
}

interface DevnetAirdropOutput {
  rpcUrl: string;
  amountSol: number;
  targetCount: number;
  results: DevnetAirdropTargetResult[];
}

const rpcRequest = async <T>(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<T> => {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC request failed (${response.status} ${response.statusText}) for method "${method}"`);
  }

  const payload = await response.json();
  if (payload && typeof payload === "object" && "error" in payload && payload.error) {
    const message =
      typeof payload.error === "object" &&
      payload.error &&
      "message" in payload.error &&
      typeof payload.error.message === "string"
        ? payload.error.message
        : JSON.stringify(payload.error);
    throw new Error(`RPC ${method} failed: ${message}`);
  }

  if (!payload || typeof payload !== "object" || !("result" in payload)) {
    throw new Error(`RPC ${method} returned an invalid response`);
  }

  return payload.result as T;
};

const resolveLamports = (amountSol: string): number => {
  const trimmed = amountSol.trim();
  if (!trimmed) {
    throw new Error("Amount cannot be empty");
  }

  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid SOL amount "${amountSol}"`);
  }

  const lamports = Math.round(value * LAMPORTS_PER_SOL);
  if (!Number.isSafeInteger(lamports) || lamports <= 0) {
    throw new Error(`Invalid lamports value derived from SOL amount "${amountSol}"`);
  }

  return lamports;
};

const parseSolAmount = (amountSol: number | string): number => {
  if (typeof amountSol === "number") {
    if (!Number.isFinite(amountSol) || amountSol <= 0) {
      throw new Error(`Invalid SOL amount "${amountSol}"`);
    }
    return amountSol;
  }

  const trimmed = amountSol.trim();
  if (!trimmed) {
    throw new Error("Amount cannot be empty");
  }

  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid SOL amount "${amountSol}"`);
  }

  return value;
};

const readWalletLibrary = async () => {
  const walletLibraryFilePath = resolveWalletLibraryFilePath();
  const file = Bun.file(walletLibraryFilePath);
  if (!(await file.exists())) {
    throw new Error(`Wallet library not found: ${walletLibraryFilePath}`);
  }

  const lines = (await file.text())
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.map((line, index) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid wallet library JSON on line ${index + 1}: ${message}`);
    }

    return walletLibraryEntrySchema.parse(parsed);
  });
};

const resolveTargetsFromWalletLibrary = async (input: {
  walletGroup: string;
  walletNames?: string[];
}): Promise<TargetWallet[]> => {
  const entries = await readWalletLibrary();
  const requestedNames = input.walletNames ? new Set(input.walletNames) : null;

  const matches = entries.filter((entry) => {
    if (entry.walletGroup !== input.walletGroup) {
      return false;
    }
    if (requestedNames && !requestedNames.has(entry.walletName)) {
      return false;
    }
    return true;
  });

  if (matches.length === 0) {
    const requestedLabel =
      requestedNames && requestedNames.size > 0
        ? `${input.walletGroup}:${[...requestedNames].join(",")}`
        : input.walletGroup;
    throw new Error(`No wallets found for "${requestedLabel}" in wallet library`);
  }

  return dedupeTargets(
    matches.map((entry) => ({
      address: entry.address,
      label: `${entry.walletGroup}.${entry.walletName}`,
    })),
  );
};

const dedupeTargets = (targets: TargetWallet[]): TargetWallet[] => {
  const seen = new Set<string>();
  return targets.filter((target) => {
    if (seen.has(target.address)) {
      return false;
    }
    seen.add(target.address);
    return true;
  });
};

const resolveTargets = async (input: {
  addresses: string[];
  walletGroup?: string;
  walletNames?: string[];
}): Promise<TargetWallet[]> => {
  const directTargets = input.addresses.map((address) => ({
    address: base58AddressSchema.parse(address),
    label: address,
  }));

  if (!input.walletGroup) {
    if (directTargets.length === 0) {
      throw new Error("Provide at least one address, or pass --wallet-group");
    }
    return dedupeTargets(directTargets);
  }

  const managedTargets = await resolveTargetsFromWalletLibrary({
    walletGroup: walletGroupNameSchema.parse(input.walletGroup),
    walletNames: input.walletNames?.map((name) => walletNameSchema.parse(name)),
  });

  return dedupeTargets([...directTargets, ...managedTargets]);
};

const waitForSignatureConfirmation = async (input: {
  rpcUrl: string;
  signature: string;
  timeoutMs: number;
  commitment: CommitmentLevel;
}): Promise<void> => {
  const timeoutAt = Date.now() + input.timeoutMs;

  while (Date.now() < timeoutAt) {
    const statusResponse = await rpcRequest<{
      value: Array<
        | {
            err: unknown;
            confirmationStatus?: CommitmentLevel | null;
          }
        | null
      >;
    }>(input.rpcUrl, "getSignatureStatuses", [[input.signature]]);

    const status = statusResponse.value[0];
    if (status?.err) {
      throw new Error(`Airdrop transaction ${input.signature} failed: ${JSON.stringify(status.err)}`);
    }

    if (status && isCommitmentSatisfied(status.confirmationStatus ?? null, input.commitment)) {
      return;
    }

    await Bun.sleep(500);
  }

  throw new Error(`Timed out waiting for airdrop confirmation for signature ${input.signature}`);
};

const isCommitmentSatisfied = (
  actual: CommitmentLevel | null,
  required: CommitmentLevel,
): boolean => {
  if (!actual) {
    return false;
  }

  const order: CommitmentLevel[] = ["processed", "confirmed", "finalized"];
  return order.indexOf(actual) >= order.indexOf(required);
};

const getSolBalance = async (rpcUrl: string, address: string): Promise<number> => {
  const response = await rpcRequest<{ value: number }>(rpcUrl, "getBalance", [
    address,
    { commitment: DEFAULT_COMMITMENT },
  ]);
  return response.value / LAMPORTS_PER_SOL;
};

const requestAirdrop = async (input: {
  rpcUrl: string;
  address: string;
  lamports: number;
  timeoutMs: number;
  commitment: CommitmentLevel;
}) => {
  const signature = await rpcRequest<string>(input.rpcUrl, "requestAirdrop", [
    input.address,
    input.lamports,
    { commitment: input.commitment },
  ]);

  await waitForSignatureConfirmation({
    rpcUrl: input.rpcUrl,
    signature,
    timeoutMs: input.timeoutMs,
    commitment: input.commitment,
  });

  return signature;
};

const printHelp = (): void => {
  console.log(
    [
      "Usage:",
      "  bun run devnet:airdrop -- <address> [more-addresses...]",
      "  bun run devnet:airdrop -- --wallet-group core-wallets",
      "  bun run devnet:airdrop -- --wallet-group core-wallets --wallet-name wallet001 --wallet-name wallet002",
      "",
      "Options:",
      "  --wallet-group <group>   Airdrop to managed wallets in this wallet group",
      "  --wallet-name <name>     Limit to one or more wallet names inside the group",
      "  --amount-sol <amount>    SOL amount per target wallet (default: 2)",
      "  --rpc-url <url>          Devnet RPC URL (default: DEVNET_RPC_URL env or public devnet RPC)",
      "  --timeout-ms <ms>        Confirmation timeout per airdrop (default: 45000)",
      "  --commitment <level>     processed | confirmed | finalized (default: confirmed)",
      "  --help                   Show this help text",
    ].join("\n"),
  );
};

export const main = async (): Promise<void> => {
  const parsed = parseArgs({
    args: Bun.argv.slice(2),
    allowPositionals: true,
    options: {
      "wallet-group": { type: "string" },
      "wallet-name": { type: "string", multiple: true },
      "amount-sol": { type: "string" },
      "rpc-url": { type: "string" },
      "timeout-ms": { type: "string" },
      commitment: { type: "string" },
      help: { type: "boolean" },
    },
  });

  if (parsed.values.help) {
    printHelp();
    return;
  }

  const output = await executeDevnetAirdrop({
    addresses: parsed.positionals,
    walletGroup: parsed.values["wallet-group"],
    walletNames: parsed.values["wallet-name"],
    amountSol: parsed.values["amount-sol"] ?? "2",
    rpcUrl: parsed.values["rpc-url"],
    timeoutMs: parsed.values["timeout-ms"] ? Number(parsed.values["timeout-ms"]) : DEFAULT_TIMEOUT_MS,
    commitment: (parsed.values.commitment ?? DEFAULT_COMMITMENT) as CommitmentLevel,
  });

  console.log(`RPC: ${output.rpcUrl}`);
  console.log(`Targets: ${output.targetCount}`);
  console.log(`Amount per wallet: ${output.amountSol} SOL`);

  for (const result of output.results) {
    console.log(`Confirmed ${result.signature} for ${result.label} (${result.address}) | balance: ${result.balanceSol.toFixed(6)} SOL`);
  }
};

export const executeDevnetAirdrop = async (rawInput: DevnetAirdropInput): Promise<DevnetAirdropOutput> => {
  const input = devnetAirdropInputSchema.parse(rawInput);
  const rpcUrl = input.rpcUrl ?? process.env.DEVNET_RPC_URL ?? DEVNET_RPC_URL;
  const amountSol = parseSolAmount(input.amountSol);
  const lamports = resolveLamports(String(amountSol));
  const targets = await resolveTargets({
    addresses: input.addresses ?? [],
    walletGroup: input.walletGroup,
    walletNames: input.walletNames,
  });

  const results: DevnetAirdropTargetResult[] = [];

  for (const target of targets) {
    const signature = await requestAirdrop({
      rpcUrl,
      address: target.address,
      lamports,
      timeoutMs: input.timeoutMs,
      commitment: input.commitment,
    });
    const balanceSol = await getSolBalance(rpcUrl, target.address);
    results.push({
      address: target.address,
      label: target.label,
      signature,
      balanceSol,
    });
  }

  return {
    rpcUrl,
    amountSol,
    targetCount: results.length,
    results,
  };
};

export const devnetAirdropAction: Action<DevnetAirdropInput, DevnetAirdropOutput> = {
  name: "devnetAirdrop",
  category: "wallet-based",
  inputSchema: devnetAirdropInputSchema,
  async execute(_ctx, rawInput) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();

    try {
      const output = await executeDevnetAirdrop(rawInput);
      return {
        ok: true,
        retryable: false,
        data: output,
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
        code: "DEVNET_AIRDROP_FAILED",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }
  },
};

if (import.meta.main) {
  await main();
}
