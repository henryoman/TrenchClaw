import type { ActionResult } from "./action";

export type JobStatus = "pending" | "running" | "paused" | "stopped" | "failed";

export interface JobState {
  id: string;
  botId: string;
  routineName: string;
  status: JobStatus;
  config: Record<string, unknown>;
  nextRunAt?: number;
  lastRunAt?: number;
  cyclesCompleted: number;
  totalCycles?: number;
  lastResult?: ActionResult;
  createdAt: number;
  updatedAt: number;
}

export type ChatMessageRole = "system" | "user" | "assistant" | "tool";

export interface ConversationState {
  id: string;
  sessionId?: string;
  title?: string;
  summary?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessageState {
  id: string;
  conversationId: string;
  role: ChatMessageRole;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface StateStore {
  saveJob(job: JobState): void;
  getJob(id: string): JobState | null;
  listJobs(filter?: { status?: JobStatus; botId?: string }): JobState[];
  updateJobStatus(id: string, status: JobStatus, meta?: Partial<JobState>): void;
  saveReceipt(receipt: ActionResult): void;
  getReceipt(idempotencyKey: string): ActionResult | null;
  getRecentReceipts(limit: number): ActionResult[];
  saveConversation(conversation: ConversationState): void;
  getConversation(id: string): ConversationState | null;
  listConversations(limit?: number): ConversationState[];
  saveChatMessage(message: ChatMessageState): void;
  listChatMessages(conversationId: string, limit?: number): ChatMessageState[];
}
