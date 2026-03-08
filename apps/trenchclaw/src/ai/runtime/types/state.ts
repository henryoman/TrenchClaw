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
  attemptCount?: number;
  leaseOwner?: string;
  leaseExpiresAt?: number;
  lastError?: string;
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

export interface InstanceFactState {
  id: string;
  instanceId: string;
  factKey: string;
  factValue: unknown;
  confidence: number;
  source: string;
  sourceMessageId?: string;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
}

export interface InstanceProfileState {
  instanceId: string;
  displayName?: string;
  summary?: string;
  tradingStyle?: string;
  riskTolerance?: string;
  preferredAssets?: string[];
  dislikedAssets?: string[];
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface InstanceMemoryBundle {
  instanceId: string;
  profile: InstanceProfileState | null;
  facts: InstanceFactState[];
  factMap: Record<string, unknown>;
  fetchedAt: number;
}

export type RuntimeSearchScope = "all" | "conversations" | "messages" | "jobs" | "receipts";

export interface RuntimeSearchResult {
  query: string;
  scope: RuntimeSearchScope;
  totalMatches: number;
  conversations: ConversationState[];
  messages: ChatMessageState[];
  jobs: JobState[];
  receipts: ActionResult[];
}

export interface RuntimeKnowledgeSurface {
  schemaSnapshot?: string;
  generatedAt: number;
  counts: {
    conversations: number;
    messages: number;
    jobs: number;
    receipts: number;
  };
  jobStatusCounts: Partial<Record<JobStatus, number>>;
  recentConversations: ConversationState[];
  recentJobs: JobState[];
  recentReceipts: ActionResult[];
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
  saveInstanceProfile(profile: InstanceProfileState): void;
  getInstanceProfile(instanceId: string): InstanceProfileState | null;
  saveInstanceFact(fact: InstanceFactState): void;
  listInstanceFacts(input: {
    instanceId: string;
    limit?: number;
    includeExpired?: boolean;
    keyPrefix?: string;
  }): InstanceFactState[];
  getInstanceFact(input: { instanceId: string; factKey: string; includeExpired?: boolean }): InstanceFactState | null;
  searchRuntimeText(input: {
    query: string;
    scope?: RuntimeSearchScope;
    limit?: number;
    messageScanLimit?: number;
  }): RuntimeSearchResult;
  getRuntimeKnowledgeSurface(input?: {
    recentConversationsLimit?: number;
    recentJobsLimit?: number;
    recentReceiptsLimit?: number;
  }): RuntimeKnowledgeSurface;
}
