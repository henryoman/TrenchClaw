import { createSolanaRpc, signature } from "@solana/kit";

export type UltraTrackedStatus = "pending" | "confirmed" | "finalized" | "failed" | "unknown";

export interface RegisterUltraConfirmationInput {
  signature: string;
  requestId: string;
  rpcUrl?: string;
  commitment?: "processed" | "confirmed" | "finalized";
  metadata?: Record<string, unknown>;
}

export interface UltraTrackedTransaction {
  signature: string;
  requestId: string;
  status: UltraTrackedStatus;
  confirmationStatus?: string;
  err?: unknown;
  slot?: number;
  registeredAt: number;
  lastCheckedAt?: number;
  metadata?: Record<string, unknown>;
}

const DEFAULT_COMMITMENT: RegisterUltraConfirmationInput["commitment"] = "confirmed";
const POLL_INTERVAL_MS = 3_000;
const MAX_RETENTION_MS = 30 * 60 * 1000;

const trackedTransactions = new Map<string, UltraTrackedTransaction>();
let trackerTimer: ReturnType<typeof setInterval> | undefined;

export function registerTransactionForConfirmation(input: RegisterUltraConfirmationInput): void {
  const now = Date.now();
  trackedTransactions.set(input.signature, {
    signature: input.signature,
    requestId: input.requestId,
    status: "pending",
    registeredAt: now,
    metadata: input.metadata,
  });

  startTracker();
  void checkSignature(input.signature, input.rpcUrl, input.commitment ?? DEFAULT_COMMITMENT);
}

export function getTrackedUltraTransaction(signatureValue: string): UltraTrackedTransaction | undefined {
  return trackedTransactions.get(signatureValue);
}

export function listTrackedUltraTransactions(limit = 100): UltraTrackedTransaction[] {
  return Array.from(trackedTransactions.values())
    .toSorted((a, b) => b.registeredAt - a.registeredAt)
    .slice(0, limit);
}

function startTracker(): void {
  if (trackerTimer) {
    return;
  }

  trackerTimer = setInterval(() => {
    void pollTrackedTransactions();
  }, POLL_INTERVAL_MS);
}

async function pollTrackedTransactions(): Promise<void> {
  const now = Date.now();
  const signatures = Array.from(trackedTransactions.keys());
  const pendingChecks: Promise<void>[] = [];

  for (const signatureValue of signatures) {
    const current = trackedTransactions.get(signatureValue);
    if (!current) {
      continue;
    }

    const ageMs = now - current.registeredAt;
    const terminal =
      current.status === "failed" || current.status === "finalized" || current.status === "confirmed";
    if (terminal || ageMs > MAX_RETENTION_MS) {
      trackedTransactions.delete(signatureValue);
      continue;
    }

    pendingChecks.push(checkSignature(signatureValue));
  }

  if (pendingChecks.length > 0) {
    await Promise.all(pendingChecks);
  }

  if (trackedTransactions.size === 0 && trackerTimer) {
    clearInterval(trackerTimer);
    trackerTimer = undefined;
  }
}

async function checkSignature(
  signatureValue: string,
  rpcUrl?: string,
  commitment: RegisterUltraConfirmationInput["commitment"] = DEFAULT_COMMITMENT,
): Promise<void> {
  const current = trackedTransactions.get(signatureValue);
  if (!current) {
    return;
  }

  if (!rpcUrl) {
    trackedTransactions.set(signatureValue, {
      ...current,
      status: "unknown",
      lastCheckedAt: Date.now(),
    });
    return;
  }

  try {
    const rpc = createSolanaRpc(rpcUrl);
    const response = await rpc.getSignatureStatuses([signature(signatureValue)], {
      searchTransactionHistory: true,
    }).send();

    const status = response.value[0];
    if (!status) {
      trackedTransactions.set(signatureValue, {
        ...current,
        status: "pending",
        lastCheckedAt: Date.now(),
      });
      return;
    }

    const confirmationStatus = String(status.confirmationStatus ?? "processed");
    const nextStatus: UltraTrackedStatus = status.err
      ? "failed"
      : confirmationStatus === "finalized"
        ? "finalized"
        : commitment === "finalized"
          ? "pending"
          : confirmationStatus === "confirmed" || confirmationStatus === "finalized"
            ? "confirmed"
            : "pending";

    trackedTransactions.set(signatureValue, {
      ...current,
      status: nextStatus,
      err: status.err,
      slot: Number(status.slot),
      confirmationStatus,
      lastCheckedAt: Date.now(),
    });
  } catch {
    trackedTransactions.set(signatureValue, {
      ...current,
      status: "unknown",
      lastCheckedAt: Date.now(),
    });
  }
}
