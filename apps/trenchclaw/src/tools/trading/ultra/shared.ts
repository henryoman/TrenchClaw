import { z } from "zod";

import type { ActionContext } from "../../../ai/contracts/types/context";
import type { ActionResult } from "../../../ai/contracts/types/action";
import type { JupiterUltraAdapter, JupiterUltraOrderRequest } from "../../../solana/lib/jupiter/ultra";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const SOL_LAMPORTS = 1_000_000_000n;
const NEW_TOKEN_ACCOUNT_RENT_LAMPORTS = 2_039_280n;
const TRANSACTION_FEE_BUFFER_LAMPORTS = 5_000n;
const NEW_TOKEN_ACCOUNT_RESERVE_LAMPORTS = NEW_TOKEN_ACCOUNT_RENT_LAMPORTS + TRANSACTION_FEE_BUFFER_LAMPORTS;
const SOLANA_ADDRESS_REGEX = /([1-9A-HJ-NP-Za-km-z]{32,44})/;

const DEFAULT_COIN_ALIASES: Record<string, string> = {
  SOL: SOL_MINT,
  WSOL: SOL_MINT,
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD5vQj8sR6v7SxrLQY6t7y",
  JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
};

type AmountUnit = "ui" | "native" | "percent";

interface TokenBalanceReader {
  getSolBalance(walletAddress: string): Promise<number>;
  getTokenBalance(walletAddress: string, mintAddress: string): Promise<number>;
  hasTokenAccount?(walletAddress: string, mintAddress: string): Promise<boolean>;
  getDecimals(mintAddress: string): Promise<number>;
}

interface UltraContext extends ActionContext {
  jupiterUltra?: JupiterUltraAdapter;
  tokenAccounts?: TokenBalanceReader;
  ultraSigner?: {
    address?: string;
    signBase64Transaction: (base64Transaction: string) => Promise<string>;
  };
}

export const amountInputSchema = z.object({
  amount: z.union([z.number().positive(), z.string().min(1)]),
  amountUnit: z.enum(["ui", "native", "percent"]).optional(),
});

const quotePairSchema = z.object({
  inputCoin: z.string().min(1),
  outputCoin: z.string().min(1),
  taker: z.string().min(1).optional(),
  mode: z.enum(["ExactIn", "ExactOut"]).optional(),
  referralAccount: z.string().min(1).optional(),
  referralFee: z.number().int().nonnegative().max(10_000).optional(),
  coinAliases: z.record(z.string(), z.string()).optional(),
});

export const ultraQuoteInputSchema = quotePairSchema.extend(amountInputSchema.shape);

export const ultraExecuteInputSchema = z.object({
  requestId: z.string().min(1),
  signedTransaction: z.string().min(1).optional(),
  // If present, we'll sign this with ctx.ultraSigner.
  transaction: z.string().min(1).optional(),
});

export const createActionSuccess = <TData>(
  idempotencyKey: string,
  data: TData,
  txSignature?: string,
): ActionResult<TData> => ({
  ok: true,
  retryable: false,
  data,
  txSignature,
  durationMs: 0,
  timestamp: Date.now(),
  idempotencyKey,
});

export const createActionFailure = <TData = unknown>(
  idempotencyKey: string,
  error: string,
  retryable = false,
  code?: string,
): ActionResult<TData> => ({
  ok: false,
  retryable,
  error,
  code,
  durationMs: 0,
  timestamp: Date.now(),
  idempotencyKey,
});

export const getUltraAdapter = (ctx: ActionContext): JupiterUltraAdapter => {
  const ultra = (ctx as UltraContext).jupiterUltra;
  if (!ultra) {
    throw new Error("Missing Jupiter Ultra adapter in action context (ctx.jupiterUltra)");
  }
  return ultra;
};

export const getTakerFromContext = (ctx: ActionContext): string | undefined => {
  const signerAddress = (ctx as UltraContext).ultraSigner?.address;
  if (typeof signerAddress === "string" && signerAddress.length > 0) {
    return signerAddress;
  }

  const wallet = ctx.wallet as { publicKey?: unknown } | string | undefined;
  if (typeof wallet === "string" && wallet.length > 0) {
    return wallet;
  }

  const walletPubkey = wallet && typeof wallet === "object" ? wallet.publicKey : undefined;
  if (typeof walletPubkey === "string" && walletPubkey.length > 0) {
    return walletPubkey;
  }
  if (walletPubkey && typeof walletPubkey === "object" && "toBase58" in walletPubkey) {
    const toBase58 = (walletPubkey as { toBase58?: () => string }).toBase58;
    if (typeof toBase58 === "function") {
      return toBase58();
    }
  }

  return undefined;
};

export const normalizeCoinToMint = (coinOrMint: string, aliases?: Record<string, string>): string => {
  const trimmed = coinOrMint.trim();
  if (!trimmed) {
    throw new Error("Coin/mint cannot be empty");
  }

  const upper = trimmed.toUpperCase();
  const aliasHit = aliases?.[upper] ?? aliases?.[trimmed] ?? DEFAULT_COIN_ALIASES[upper];
  if (aliasHit) {
    return aliasHit;
  }

  const embeddedAddress = trimmed.match(SOLANA_ADDRESS_REGEX)?.[1];
  return embeddedAddress ?? trimmed;
};

export const parseAmountAndUnit = (
  amount: number | string,
  amountUnit?: AmountUnit,
): { numericAmount: number; unit: AmountUnit } => {
  if (typeof amount === "number") {
    return {
      numericAmount: amount,
      unit: amountUnit ?? "ui",
    };
  }

  const raw = amount.trim();
  if (!raw) {
    throw new Error("Amount cannot be empty");
  }

  // Supports: "25%", "0.3 sol", "12.5 usdc", "1000000 native".
  const match = raw.match(/^([0-9]*\.?[0-9]+)\s*(%|[a-zA-Z]+)?$/);
  if (!match) {
    throw new Error(`Unsupported amount format: "${amount}"`);
  }

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid amount value: "${amount}"`);
  }

  const suffix = match[2]?.toLowerCase();
  if (suffix === "%") {
    return { numericAmount: value, unit: "percent" };
  }
  if (suffix === "native" || suffix === "raw" || suffix === "lamports") {
    return { numericAmount: value, unit: "native" };
  }

  return { numericAmount: value, unit: amountUnit ?? "ui" };
};

const getTokenReader = (ctx: ActionContext): TokenBalanceReader => {
  const tokenAccounts = (ctx as UltraContext).tokenAccounts;
  if (!tokenAccounts) {
    throw new Error("Missing token account adapter in action context (ctx.tokenAccounts)");
  }
  return tokenAccounts;
};

const formatLamportsAsSol = (lamports: bigint): string => {
  const negative = lamports < 0n;
  const absolute = negative ? -lamports : lamports;
  const whole = absolute / SOL_LAMPORTS;
  const fraction = (absolute % SOL_LAMPORTS).toString().padStart(9, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toString()}${fraction ? `.${fraction}` : ""}`;
};

const toRawTokenAmount = (uiAmount: number, decimals: number): bigint => {
  if (!Number.isFinite(uiAmount) || uiAmount <= 0) {
    throw new Error("Amount must be a positive number");
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error(`Invalid token decimals: ${decimals}`);
  }

  const [intPart, fracPart = ""] = uiAmount.toString().split(".");
  const paddedFrac = fracPart.padEnd(decimals, "0").slice(0, decimals);
  const normalized = `${intPart}${paddedFrac}`.replace(/^0+(?=\d)/, "");
  return BigInt(normalized || "0");
};

const percentToFraction = (percent: number): number => {
  if (percent <= 0 || percent > 100) {
    throw new Error("Percent amount must be > 0 and <= 100");
  }
  return percent / 100;
};

const resolveUiBalance = async (
  ctx: ActionContext,
  taker: string,
  inputMint: string,
): Promise<number> => {
  const tokenReader = getTokenReader(ctx);
  if (inputMint === SOL_MINT) {
    return tokenReader.getSolBalance(taker);
  }
  return tokenReader.getTokenBalance(taker, inputMint);
};

export const resolveRawAmount = async (
  ctx: ActionContext,
  inputMint: string,
  taker: string | undefined,
  amount: number | string,
  amountUnit?: AmountUnit,
): Promise<bigint> => {
  const { numericAmount, unit } = parseAmountAndUnit(amount, amountUnit);

  if (unit === "native") {
    if (!Number.isInteger(numericAmount)) {
      throw new Error("Native amount must be an integer");
    }
    return BigInt(numericAmount);
  }

  if (unit === "percent") {
    if (!taker) {
      throw new Error("Percent amount requires a taker wallet address");
    }

    const uiBalance = await resolveUiBalance(ctx, taker, inputMint);
    const uiAmount = uiBalance * percentToFraction(numericAmount);

    const tokenReader = getTokenReader(ctx);
    const decimals = inputMint === SOL_MINT ? 9 : await tokenReader.getDecimals(inputMint);
    return toRawTokenAmount(uiAmount, decimals);
  }

  const tokenReader = getTokenReader(ctx);
  const decimals = inputMint === SOL_MINT ? 9 : await tokenReader.getDecimals(inputMint);
  return toRawTokenAmount(numericAmount, decimals);
};

export const buildOrderRequest = async (
  ctx: ActionContext,
  input: z.infer<typeof ultraQuoteInputSchema>,
): Promise<JupiterUltraOrderRequest> => {
  const inputMint = normalizeCoinToMint(input.inputCoin, input.coinAliases);
  const outputMint = normalizeCoinToMint(input.outputCoin, input.coinAliases);
  const taker = input.taker ?? getTakerFromContext(ctx);
  const tokenReader = getTokenReader(ctx);

  const rawAmount = await resolveRawAmount(ctx, inputMint, taker, input.amount, input.amountUnit);
  if (
    taker &&
    inputMint === SOL_MINT &&
    outputMint !== SOL_MINT &&
    typeof tokenReader.hasTokenAccount === "function"
  ) {
    const hasDestinationTokenAccount = await tokenReader.hasTokenAccount(taker, outputMint);
    if (!hasDestinationTokenAccount) {
      const totalSolBalance = await tokenReader.getSolBalance(taker);
      const totalLamports = toRawTokenAmount(totalSolBalance, 9);
      const remainingLamports = totalLamports - rawAmount;

      if (remainingLamports < NEW_TOKEN_ACCOUNT_RESERVE_LAMPORTS) {
        throw new Error(
          `Insufficient SOL for a first-time buy into ${outputMint}. Remaining after swap would be ${formatLamportsAsSol(remainingLamports)} SOL, but creating the destination token account and paying fees needs about ${formatLamportsAsSol(NEW_TOKEN_ACCOUNT_RESERVE_LAMPORTS)} SOL.`,
        );
      }
    }
  }

  const orderRequest: JupiterUltraOrderRequest = {
    inputMint,
    outputMint,
    amount: rawAmount.toString(10),
    taker: taker ?? "",
    mode: input.mode,
    swapMode: input.mode,
    referralAccount: input.referralAccount,
    referralFee: input.referralFee,
  };

  if (!taker) {
    // Keep `taker` empty only when caller explicitly wants a quote without transaction.
    delete (orderRequest as { taker?: string }).taker;
  }

  return orderRequest;
};

export const signOrderTransactionIfNeeded = async (
  ctx: ActionContext,
  input: {
    requestId?: string;
    signedTransaction?: string;
    transaction?: string;
  },
): Promise<string> => {
  if (input.signedTransaction) {
    return input.signedTransaction;
  }

  if (!input.transaction) {
    throw new Error(
      "Missing signed transaction. Provide input.signedTransaction or input.transaction with ctx.ultraSigner",
    );
  }

  const signer = (ctx as UltraContext).ultraSigner;
  if (!signer) {
    throw new Error(
      "Missing Ultra signer in action context (ctx.ultraSigner). Cannot sign input.transaction.",
    );
  }

  return signer.signBase64Transaction(input.transaction);
};
