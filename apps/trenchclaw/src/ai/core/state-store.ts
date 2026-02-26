import type {
  ActionResult,
  ChatMessageState,
  ConversationState,
  JobState,
  JobStatus,
  StateStore as IStateStore,
} from "../runtime/types";

export class InMemoryStateStore implements IStateStore {
  private readonly jobs = new Map<string, JobState>();
  private readonly receipts = new Map<string, ActionResult>();
  private readonly conversations = new Map<string, ConversationState>();
  private readonly chatMessages = new Map<string, ChatMessageState[]>();

  saveJob(job: JobState): void {
    this.jobs.set(job.id, { ...job });
  }

  getJob(id: string): JobState | null {
    return this.jobs.get(id) ?? null;
  }

  listJobs(filter?: { status?: JobStatus; botId?: string }): JobState[] {
    let values = Array.from(this.jobs.values());
    if (filter?.status) {
      values = values.filter((job) => job.status === filter.status);
    }
    if (filter?.botId) {
      values = values.filter((job) => job.botId === filter.botId);
    }
    return values;
  }

  updateJobStatus(id: string, status: JobStatus, meta: Partial<JobState> = {}): void {
    const current = this.jobs.get(id);
    if (!current) {
      return;
    }
    this.jobs.set(id, {
      ...current,
      ...meta,
      status,
      updatedAt: Date.now(),
    });
  }

  saveReceipt(receipt: ActionResult): void {
    this.receipts.set(receipt.idempotencyKey, receipt);
  }

  getReceipt(idempotencyKey: string): ActionResult | null {
    return this.receipts.get(idempotencyKey) ?? null;
  }

  getRecentReceipts(limit: number): ActionResult[] {
    return Array.from(this.receipts.values())
      .toSorted((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  saveConversation(conversation: ConversationState): void {
    this.conversations.set(conversation.id, { ...conversation });
  }

  getConversation(id: string): ConversationState | null {
    return this.conversations.get(id) ?? null;
  }

  listConversations(limit = 100): ConversationState[] {
    return Array.from(this.conversations.values())
      .toSorted((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, Math.max(1, Math.trunc(limit)));
  }

  saveChatMessage(message: ChatMessageState): void {
    const messages = this.chatMessages.get(message.conversationId) ?? [];
    const existingIndex = messages.findIndex((existing) => existing.id === message.id);
    if (existingIndex >= 0) {
      messages[existingIndex] = { ...message };
    } else {
      messages.push({ ...message });
    }
    this.chatMessages.set(message.conversationId, messages);
  }

  listChatMessages(conversationId: string, limit = 500): ChatMessageState[] {
    return (this.chatMessages.get(conversationId) ?? [])
      .toSorted((a, b) => a.createdAt - b.createdAt)
      .slice(0, Math.max(1, Math.trunc(limit)));
  }
}
