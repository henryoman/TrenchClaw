import type { BotId, IdempotencyKey, JobId } from "./ids";

export type RuntimeEventMap = {
  "action:start": {
    actionName: string;
    idempotencyKey: IdempotencyKey;
    inputSummary?: string;
  };
  "action:success": {
    actionName: string;
    idempotencyKey: IdempotencyKey;
    durationMs: number;
    txSignature?: string;
  };
  "action:fail": {
    actionName: string;
    idempotencyKey: IdempotencyKey;
    error: string;
    retryable: boolean;
    attempts: number;
  };
  "action:retry": {
    actionName: string;
    idempotencyKey: IdempotencyKey;
    attempt: number;
    nextRetryMs: number;
  };
  "bot:start": {
    botId: BotId;
    routineName: string;
  };
  "bot:pause": {
    botId: BotId;
    reason?: string;
  };
  "bot:stop": {
    botId: BotId;
    reason?: string;
    finalStats?: Record<string, number>;
  };
  "policy:block": {
    actionName: string;
    policyName: string;
    reason: string;
  };
  "rpc:failover": {
    fromEndpoint: string;
    toEndpoint: string;
    reason?: string;
  };
  "queue:enqueue": {
    jobId: JobId;
    serialNumber?: number;
    botId: BotId;
    routineName: string;
    queueSize: number;
    queuePosition: number;
    nextRunAt?: number;
  };
  "queue:dequeue": {
    jobId: JobId;
    serialNumber?: number;
    botId: BotId;
    routineName: string;
    queueSize: number;
    queuePosition: number;
    waitMs: number;
  };
  "queue:complete": {
    jobId: JobId;
    serialNumber?: number;
    botId: BotId;
    routineName: string;
    status: "pending" | "failed" | "stopped";
    durationMs: number;
    cyclesCompleted: number;
  };
};

export type RuntimeEventName = keyof RuntimeEventMap;

export type RuntimeEvent<K extends RuntimeEventName = RuntimeEventName> = {
  type: K;
  timestamp: number;
  payload: RuntimeEventMap[K];
};

export type RuntimeEventHandler<K extends RuntimeEventName> = (
  event: RuntimeEvent<K>,
) => void | Promise<void>;

export interface RuntimeEventBus {
  emit<K extends RuntimeEventName>(type: K, payload: RuntimeEventMap[K]): void;
  on<K extends RuntimeEventName>(type: K, handler: RuntimeEventHandler<K>): () => void;
  once<K extends RuntimeEventName>(type: K, handler: RuntimeEventHandler<K>): () => void;
  off<K extends RuntimeEventName>(type: K, handler: RuntimeEventHandler<K>): void;
}
