export type RuntimeEventMap = {
  "action:start": {
    actionName: string;
    idempotencyKey: string;
    inputSummary?: string;
  };
  "action:success": {
    actionName: string;
    idempotencyKey: string;
    durationMs: number;
    txSignature?: string;
  };
  "action:fail": {
    actionName: string;
    idempotencyKey: string;
    error: string;
    retryable: boolean;
    attempts: number;
  };
  "action:retry": {
    actionName: string;
    idempotencyKey: string;
    attempt: number;
    nextRetryMs: number;
  };
  "bot:start": {
    botId: string;
    routineName: string;
  };
  "bot:pause": {
    botId: string;
    reason?: string;
  };
  "bot:stop": {
    botId: string;
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
