import { getSignatureFromTransaction, getTransactionDecoder } from "@solana/transactions";

export interface UltraPhaseTimings {
  orderMs: number;
  signingMs: number;
  submitMs: number;
  totalMs: number;
}

export async function parseUltraJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function resolveRequestId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.requestId === "string") {
    return record.requestId;
  }
  if (typeof record.id === "string") {
    return record.id;
  }

  const nested = record.quoteResponse;
  if (nested && typeof nested === "object") {
    return resolveRequestId(nested);
  }

  return null;
}

export function resolveSwapTransaction(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const prioritizedKeys = [
    "swapTransaction",
    "transaction",
    "serializedTransaction",
    "encodedTransaction",
    "signedTransaction",
    "base64",
    "data",
    "message",
  ];

  for (const key of prioritizedKeys) {
    const value = record[key];
    if (typeof value === "string") {
      if (isLikelyTransactionBase64(value)) {
        return value;
      }
      continue;
    }

    const arrayEncoded = toBase64FromArrayLike(value);
    if (arrayEncoded) {
      return arrayEncoded;
    }

    const nested = findBase64EncodedTransaction(value);
    if (nested) {
      return nested;
    }
  }

  return findBase64EncodedTransaction(record);
}

function findBase64EncodedTransaction(
  input: unknown,
  visited = new Set<unknown>(),
): string | null {
  if (typeof input === "string") {
    return isLikelyTransactionBase64(input) ? input : null;
  }
  if (!input || typeof input !== "object") {
    return null;
  }
  if (visited.has(input)) {
    return null;
  }
  visited.add(input);

  if (Array.isArray(input)) {
    const encoded = toBase64FromArrayLike(input);
    if (encoded) {
      return encoded;
    }
    for (const entry of input) {
      const nested = findBase64EncodedTransaction(entry, visited);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  const record = input as Record<string, unknown>;
  for (const value of Object.values(record)) {
    const nested = findBase64EncodedTransaction(value, visited);
    if (nested) {
      return nested;
    }
  }

  return null;
}

export function extractOutAmount(payload: unknown): string | undefined {
  return extractStringField(payload, "outAmount");
}

export function extractInAmount(payload: unknown): string | undefined {
  return extractStringField(payload, "inAmount");
}

export function extractFeeBps(payload: unknown): number | undefined {
  return extractNumericField(payload, "feeBps");
}

export function extractPrioritizationFee(payload: unknown): number | undefined {
  return extractNumericField(payload, "prioritizationFeeLamports");
}

export function extractSignatureFee(payload: unknown): number | undefined {
  return extractNumericField(payload, "signatureFeeLamports");
}

export function extractRentFee(payload: unknown): number | undefined {
  return extractNumericField(payload, "rentFeeLamports");
}

export function extractSignatureFromSignedTransaction(base64Transaction: string): string | undefined {
  try {
    const txBytes = Buffer.from(base64Transaction, "base64");
    const transaction = getTransactionDecoder().decode(txBytes);
    return getSignatureFromTransaction(transaction);
  } catch {
    return undefined;
  }
}

export function roundTimings(timings: UltraPhaseTimings): UltraPhaseTimings {
  return {
    orderMs: Math.max(0, Math.round(timings.orderMs)),
    signingMs: Math.max(0, Math.round(timings.signingMs)),
    submitMs: Math.max(0, Math.round(timings.submitMs)),
    totalMs: Math.max(0, Math.round(timings.totalMs)),
  };
}

export function formatUltraError(prefix: string, status: number, payload: unknown): string {
  const base = `${prefix}: ${status}`;
  if (!payload) {
    return base;
  }
  if (typeof payload === "string") {
    return `${base} ${payload}`;
  }
  try {
    return `${base} ${JSON.stringify(payload)}`;
  } catch {
    return base;
  }
}

export function normalizeAmount(rawAmount: bigint | number | string): string {
  if (typeof rawAmount === "bigint") {
    return rawAmount.toString(10);
  }

  const raw = String(rawAmount);
  try {
    return BigInt(raw).toString(10);
  } catch {
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
      return Math.round(numeric).toString(10);
    }
  }

  return raw;
}

function extractStringField(payload: unknown, field: string): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record[field] === "string") {
    return record[field] as string;
  }

  const nestedKeys = ["quoteResponse", "data"];
  for (const key of nestedKeys) {
    const nested = record[key];
    if (nested && typeof nested === "object") {
      const nestedValue = extractStringField(nested, field);
      if (nestedValue !== undefined) {
        return nestedValue;
      }
    }
  }

  return undefined;
}

function extractNumericField(payload: unknown, field: string): number | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  const immediate = coerceToNumber(record[field]);
  if (immediate !== undefined) {
    return immediate;
  }

  const nestedKeys = ["quoteResponse", "data"];
  for (const key of nestedKeys) {
    const nested = record[key];
    if (nested && typeof nested === "object") {
      const nestedValue = extractNumericField(nested, field);
      if (nestedValue !== undefined) {
        return nestedValue;
      }
    }
  }

  return undefined;
}

function coerceToNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function isLikelyTransactionBase64(value: string): boolean {
  if (!value || value.length < 80 || value.length % 4 !== 0) {
    return false;
  }
  if (!BASE64_CHARSET_REGEX.test(value)) {
    return false;
  }

  try {
    const decoded = Buffer.from(value, "base64");
    return decoded.length > 0;
  } catch {
    return false;
  }
}

function toBase64FromArrayLike(value: unknown): string | null {
  if (value instanceof Uint8Array || value instanceof Uint16Array || value instanceof Uint32Array) {
    return Buffer.from(value).toString("base64");
  }
  if (Array.isArray(value) && value.every((entry) => typeof entry === "number")) {
    return Buffer.from(value as number[]).toString("base64");
  }
  if (
    value &&
    typeof value === "object" &&
    "type" in (value as Record<string, unknown>) &&
    (value as Record<string, unknown>).type === "Buffer" &&
    Array.isArray((value as Record<string, unknown>).data)
  ) {
    return Buffer.from((value as { data: number[] }).data).toString("base64");
  }
  return null;
}

const BASE64_CHARSET_REGEX = /^[A-Za-z0-9+/=]+$/;
