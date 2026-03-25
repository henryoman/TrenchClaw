import type {
  RuntimeApiActivityEntry,
  RuntimeApiConversationView,
  RuntimeApiInstanceProfileView,
} from "@trenchclaw/types";
import { resolveCurrentActiveInstanceIdSync } from "../instance/state";
import type { RuntimeBootstrap } from "../bootstrap";

export interface RuntimeTransportContext {
  readonly runtime: RuntimeBootstrap;
  getActiveInstance(): RuntimeApiInstanceProfileView | null;
  setActiveInstance(instance: RuntimeApiInstanceProfileView | null): void;
  getActiveChatId(): string | null;
  setActiveChatId(chatId: string | null): void;
  addActivity(source: RuntimeApiActivityEntry["source"], summary: string): void;
  onActivity(listener: () => void): () => void;
  listInstanceConversations(limit?: number): RuntimeApiConversationView[];
  resolveDefaultChatId(): string;
  getActivityEntries(limit: number): RuntimeApiActivityEntry[];
  waitForJobResult(jobId: string, waitMs: number): Promise<ReturnType<RuntimeBootstrap["stateStore"]["getJob"]>>;
}

export const resolveSurfaceInstanceId = (
  context: Pick<RuntimeTransportContext, "getActiveInstance">,
): string | null => context.getActiveInstance()?.localInstanceId ?? resolveCurrentActiveInstanceIdSync();

export const requireSurfaceInstanceId = (
  context: Pick<RuntimeTransportContext, "getActiveInstance">,
  missingMessage: string,
): string => {
  const instanceId = resolveSurfaceInstanceId(context);
  if (!instanceId) {
    throw new Error(missingMessage);
  }
  return instanceId;
};
