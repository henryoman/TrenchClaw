import type { ActionResult } from "./action";
import type {
  BotId,
  ChatMessageId,
  ConversationId,
  FactId,
  FactKey,
  IdempotencyKey,
  InstanceId,
  JobId,
  SessionId,
} from "./ids";

export type JobStatus = "pending" | "running" | "paused" | "stopped" | "failed";

export interface JobState {
  id: JobId;
  serialNumber?: number;
  botId: BotId;
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
  id: ConversationId;
  sessionId?: SessionId;
  title?: string;
  summary?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessageState {
  id: ChatMessageId;
  conversationId: ConversationId;
  role: ChatMessageRole;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface InstanceFactState {
  id: FactId;
  instanceId: InstanceId;
  factKey: FactKey;
  factValue: unknown;
  confidence: number;
  source: string;
  sourceMessageId?: ChatMessageId;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
}

export interface InstanceProfileState {
  instanceId: InstanceId;
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
  instanceId: InstanceId;
  profile: InstanceProfileState | null;
  facts: InstanceFactState[];
  factMap: Record<string, unknown>;
  fetchedAt: number;
}

export type RuntimeSearchScope = "all" | "conversations" | "messages" | "jobs" | "receipts";

export interface ConversationHistorySlice {
  conversationId: ConversationId;
  requestedBeforeMessageId?: ChatMessageId;
  messages: ChatMessageState[];
  estimatedTokenCount: number;
  hasMoreBefore: boolean;
  nextBeforeMessageId?: ChatMessageId;
  oldestReturnedMessageId?: ChatMessageId;
  newestReturnedMessageId?: ChatMessageId;
}

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
  getJob(id: JobId): JobState | null;
  getJobBySerialNumber(serialNumber: number): JobState | null;
  listJobs(filter?: { status?: JobStatus; botId?: BotId }): JobState[];
  updateJobStatus(id: JobId, status: JobStatus, meta?: Partial<JobState>): void;
  reserveJobSerialNumber(): number;
  tryStartJob(input: {
    id: JobId;
    expectedCycle: number;
    leaseOwner?: string;
    leaseExpiresAt?: number;
  }): JobState | null;
  saveReceipt(receipt: ActionResult): void;
  getReceipt(idempotencyKey: IdempotencyKey): ActionResult | null;
  getRecentReceipts(limit: number): ActionResult[];
  saveConversation(conversation: ConversationState): void;
  getConversation(id: ConversationId): ConversationState | null;
  listConversations(limit?: number): ConversationState[];
  deleteConversation(id: ConversationId): boolean;
  saveChatMessage(message: ChatMessageState): void;
  listChatMessages(conversationId: ConversationId, limit?: number): ChatMessageState[];
  getConversationHistorySlice(input: {
    conversationId: ConversationId;
    beforeMessageId?: ChatMessageId;
    limit?: number;
    tokenBudget?: number;
  }): ConversationHistorySlice;
  saveInstanceProfile(profile: InstanceProfileState): void;
  getInstanceProfile(instanceId: InstanceId): InstanceProfileState | null;
  saveInstanceFact(fact: InstanceFactState): void;
  listInstanceFacts(input: {
    instanceId: InstanceId;
    limit?: number;
    includeExpired?: boolean;
    keyPrefix?: FactKey | string;
  }): InstanceFactState[];
  getInstanceFact(input: { instanceId: InstanceId; factKey: FactKey; includeExpired?: boolean }): InstanceFactState | null;
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
