import type {
  RuntimeApiActivityEntry,
  RuntimeApiConversationView,
  RuntimeApiInstanceProfileView,
} from "@trenchclaw/types";
import type { RuntimeBootstrap } from "../bootstrap";

export interface RuntimeSurfaceContext {
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

export type RuntimeGuiDomainContext = RuntimeSurfaceContext;
