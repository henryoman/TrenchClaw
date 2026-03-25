import type { ActionResult } from "./action";
import type {
  ChatMessageState,
  ChatMessageStateInput,
  ConversationState,
  InstanceFactState,
  InstanceProfileState,
  JobState,
  JobStatus,
} from "../../../contracts/persistence";
import type {
  BotId,
  ChatMessageId,
  ConversationId,
  FactKey,
  IdempotencyKey,
  InstanceId,
  JobId,
} from "./ids";

export type {
  ChatMessageMetadata,
  ChatMessageRole,
  PersistedUiMessagePart,
  RuntimeSessionEntryType,
  RuntimeSessionEventEntry,
  RuntimeSessionMessageEntry,
  RuntimeSessionMessageRole,
  RuntimeSessionState,
  RuntimeSessionSummaryRecord,
  RuntimeSummaryCategory,
  RuntimeSummaryEntry,
  RuntimeSummarySource,
} from "../../../contracts/persistence";
export type {
  ChatMessageState,
  ChatMessageStateInput,
  ConversationState,
  InstanceFactState,
  InstanceProfileState,
  JobState,
  JobStatus,
} from "../../../contracts/persistence";

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
  saveChatMessage(message: ChatMessageStateInput): void;
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
