import type {
  GuiActivityEntry,
  GuiConversationView,
  GuiInstanceProfileView,
} from "@trenchclaw/types";
import type { RuntimeBootstrap } from "../bootstrap";

export interface RuntimeGuiDomainContext {
  readonly runtime: RuntimeBootstrap;
  getActiveInstance(): GuiInstanceProfileView | null;
  setActiveInstance(instance: GuiInstanceProfileView | null): void;
  getActiveChatId(): string | null;
  setActiveChatId(chatId: string | null): void;
  addActivity(source: GuiActivityEntry["source"], summary: string): void;
  onActivity(listener: () => void): () => void;
  listInstanceConversations(limit?: number): GuiConversationView[];
  resolveDefaultChatId(): string;
  getActivityEntries(limit: number): GuiActivityEntry[];
  waitForJobResult(jobId: string, waitMs: number): Promise<ReturnType<RuntimeBootstrap["stateStore"]["getJob"]>>;
}
