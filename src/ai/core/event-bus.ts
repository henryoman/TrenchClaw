import type {
  RuntimeEvent,
  RuntimeEventBus,
  RuntimeEventHandler,
  RuntimeEventMap,
  RuntimeEventName,
} from "../contracts";

export class InMemoryRuntimeEventBus implements RuntimeEventBus {
  private readonly handlers = new Map<RuntimeEventName, Set<RuntimeEventHandler<RuntimeEventName>>>();

  emit<K extends RuntimeEventName>(type: K, payload: RuntimeEventMap[K]): void {
    const event: RuntimeEvent<K> = {
      type,
      timestamp: Date.now(),
      payload,
    };

    const listeners = this.handlers.get(type);
    if (!listeners || listeners.size === 0) {
      return;
    }

    // Fire handlers asynchronously to keep emit non-blocking.
    for (const handler of listeners) {
      queueMicrotask(() => {
        const typedHandler = handler as RuntimeEventHandler<K>;
        void Promise.resolve(typedHandler(event)).catch(() => {
          // No-op by design: event bus handlers are isolated from publisher failures.
        });
      });
    }
  }

  on<K extends RuntimeEventName>(type: K, handler: RuntimeEventHandler<K>): () => void {
    const listeners = this.handlers.get(type) ?? new Set<RuntimeEventHandler<RuntimeEventName>>();
    listeners.add(handler as RuntimeEventHandler<RuntimeEventName>);
    this.handlers.set(type, listeners);
    return () => this.off(type, handler);
  }

  once<K extends RuntimeEventName>(type: K, handler: RuntimeEventHandler<K>): () => void {
    const wrapped: RuntimeEventHandler<K> = (event) => {
      this.off(type, wrapped);
      return handler(event);
    };
    return this.on(type, wrapped);
  }

  off<K extends RuntimeEventName>(type: K, handler: RuntimeEventHandler<K>): void {
    const listeners = this.handlers.get(type);
    if (!listeners) {
      return;
    }
    listeners.delete(handler as RuntimeEventHandler<RuntimeEventName>);
    if (listeners.size === 0) {
      this.handlers.delete(type);
    }
  }
}
