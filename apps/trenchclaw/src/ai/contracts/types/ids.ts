export type RuntimeId<TBrand extends string> = string & {
  readonly __brand?: TBrand;
};

export type JobId = RuntimeId<"JobId">;
export type BotId = RuntimeId<"BotId">;
export type ConversationId = RuntimeId<"ConversationId">;
export type ChatMessageId = RuntimeId<"ChatMessageId">;
export type SessionId = RuntimeId<"SessionId">;
export type InstanceId = RuntimeId<"InstanceId">;
export type FactId = RuntimeId<"FactId">;
export type FactKey = RuntimeId<"FactKey">;
export type IdempotencyKey = RuntimeId<"IdempotencyKey">;
export type ToolCallId = RuntimeId<"ToolCallId">;
export type UiTextPartId = RuntimeId<"UiTextPartId">;

const trimToUndefined = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const normalizeFragment = (value: string | undefined): string | undefined => {
  const trimmed = trimToUndefined(value);
  if (!trimmed) {
    return undefined;
  }

  const normalized = trimmed
    .replace(/[^A-Za-z0-9:_-]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");

  return normalized || undefined;
};

const createUuidBackedId = <TBrand extends RuntimeId<string>>(prefix?: string, fragment?: string): TBrand => {
  const normalizedFragment = normalizeFragment(fragment);
  const parts = [prefix, normalizedFragment, crypto.randomUUID()].filter((part) => part && part.length > 0);
  return parts.join("-") as TBrand;
};

export const createJobId = (): JobId => crypto.randomUUID() as JobId;
export const createSessionId = (): SessionId => crypto.randomUUID() as SessionId;
export const createIdempotencyKey = (): IdempotencyKey => crypto.randomUUID() as IdempotencyKey;
export const createFactId = (): FactId => createUuidBackedId<FactId>("fact");
export const createConversationId = (fragment?: string): ConversationId =>
  createUuidBackedId<ConversationId>("chat", fragment);
export const createRuntimeConversationId = (scope?: string): ConversationId =>
  `runtime-${normalizeFragment(scope) ?? "global"}` as ConversationId;
export const createChatMessageId = (fragment?: string): ChatMessageId =>
  createUuidBackedId<ChatMessageId>("msg", fragment);
export const createToolCallId = (): ToolCallId => createUuidBackedId<ToolCallId>("tool");
export const createUiTextPartId = (): UiTextPartId => createUuidBackedId<UiTextPartId>("text");
export const createInstanceConversationId = (instanceId: InstanceId | string): ConversationId =>
  createUuidBackedId<ConversationId>("instance", instanceId);
