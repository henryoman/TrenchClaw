import type {
  ActionResult,
  ChatMessageState,
  ConversationState,
  JobState,
  JobStatus,
  RuntimeKnowledgeSurface,
  RuntimeSearchResult,
  RuntimeSearchScope,
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

  searchRuntimeText(input: {
    query: string;
    scope?: RuntimeSearchScope;
    limit?: number;
    messageScanLimit?: number;
  }): RuntimeSearchResult {
    const queryLower = input.query.trim().toLowerCase();
    const scope = input.scope ?? "all";
    const limit = Math.max(1, Math.trunc(input.limit ?? 25));
    const messageScanLimit = Math.max(limit, Math.trunc(input.messageScanLimit ?? 100));
    const includes = (value: unknown) =>
      value != null && String(typeof value === "string" ? value : JSON.stringify(value)).toLowerCase().includes(queryLower);
    const includeConversations = scope === "all" || scope === "conversations";
    const includeMessages = scope === "all" || scope === "messages";
    const includeJobs = scope === "all" || scope === "jobs";
    const includeReceipts = scope === "all" || scope === "receipts";
    const conversationPool = includeConversations || includeMessages ? this.listConversations(200) : [];

    const conversations = includeConversations
      ? conversationPool
          .filter(
            (conversation) =>
              includes(conversation.id) ||
              includes(conversation.sessionId) ||
              includes(conversation.title) ||
              includes(conversation.summary),
          )
          .slice(0, limit)
      : [];
    const messages = includeMessages
      ? conversationPool
          .flatMap((conversation) => this.listChatMessages(conversation.id, messageScanLimit))
          .filter((message) => includes(message.id) || includes(message.role) || includes(message.content))
          .slice(0, limit)
      : [];
    const jobs = includeJobs
      ? this.listJobs()
          .filter(
            (job) =>
              includes(job.id) ||
              includes(job.botId) ||
              includes(job.routineName) ||
              includes(job.status) ||
              includes(job.lastResult),
          )
          .slice(0, limit)
      : [];
    const receipts = includeReceipts
      ? this.getRecentReceipts(200)
          .filter(
            (receipt) =>
              includes(receipt.idempotencyKey) ||
              includes(receipt.code) ||
              includes(receipt.error) ||
              includes(receipt.txSignature) ||
              includes(receipt.data),
          )
          .slice(0, limit)
      : [];

    return {
      query: input.query.trim(),
      scope,
      totalMatches: conversations.length + messages.length + jobs.length + receipts.length,
      conversations,
      messages,
      jobs,
      receipts,
    };
  }

  getRuntimeKnowledgeSurface(input?: {
    recentConversationsLimit?: number;
    recentJobsLimit?: number;
    recentReceiptsLimit?: number;
  }): RuntimeKnowledgeSurface {
    const conversations = this.listConversations(10_000);
    const messages = conversations.reduce((total, conversation) => total + this.listChatMessages(conversation.id, 10_000).length, 0);
    const jobs = this.listJobs();
    const jobStatusCounts: Partial<Record<JobStatus, number>> = {};
    for (const job of jobs) {
      jobStatusCounts[job.status] = (jobStatusCounts[job.status] ?? 0) + 1;
    }

    return {
      generatedAt: Date.now(),
      counts: {
        conversations: conversations.length,
        messages,
        jobs: jobs.length,
        receipts: this.receipts.size,
      },
      jobStatusCounts,
      recentConversations: conversations.slice(0, Math.max(1, Math.trunc(input?.recentConversationsLimit ?? 20))),
      recentJobs: jobs.slice(0, Math.max(1, Math.trunc(input?.recentJobsLimit ?? 20))),
      recentReceipts: this.getRecentReceipts(Math.max(1, Math.trunc(input?.recentReceiptsLimit ?? 20))),
    };
  }
}
