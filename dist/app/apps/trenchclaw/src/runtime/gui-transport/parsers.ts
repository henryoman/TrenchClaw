import type {
  GuiCreateInstanceRequest,
  GuiDeleteSecretRequest,
  GuiSignInInstanceRequest,
  GuiUpdateVaultRequest,
  GuiUpsertSecretRequest,
} from "@trenchclaw/types";
import type { UIMessage } from "ai";
import { DISPATCH_TEST_DEFAULT_WAIT_MS, DISPATCH_TEST_MAX_WAIT_MS } from "./constants";

export interface DispatcherTestRequest {
  message: string;
  waitMs: number;
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const parseUiChatRequest = async (
  request: Request,
): Promise<{ messages: UIMessage[]; chatId?: string; conversationTitle?: string; metadata?: Record<string, unknown> } | null> => {
  const toUserMessage = (text: string): UIMessage => ({
    id: `msg-${crypto.randomUUID()}`,
    role: "user",
    parts: [{ type: "text", text }],
  });

  const toUiMessage = (value: unknown): UIMessage | null => {
    if (!isRecord(value)) {
      return null;
    }

    const role = value.role;
    if (role !== "system" && role !== "user" && role !== "assistant") {
      return null;
    }

    const id = typeof value.id === "string" && value.id.trim().length > 0 ? value.id.trim() : `msg-${crypto.randomUUID()}`;
    if (Array.isArray(value.parts)) {
      return {
        id,
        role,
        parts: value.parts as UIMessage["parts"],
      };
    }

    if (typeof value.content === "string" && value.content.trim().length > 0) {
      return {
        id,
        role,
        parts: [{ type: "text", text: value.content.trim() }],
      };
    }

    if (typeof value.text === "string" && value.text.trim().length > 0) {
      return {
        id,
        role,
        parts: [{ type: "text", text: value.text.trim() }],
      };
    }

    return null;
  };

  const toUiMessages = (value: unknown): UIMessage[] | null => {
    if (!Array.isArray(value)) {
      return null;
    }
    const messages = value
      .map((entry) => toUiMessage(entry))
      .filter((entry): entry is UIMessage => entry !== null);
    return messages.length > 0 ? messages : null;
  };

  const extractMessages = (value: Record<string, unknown>): UIMessage[] | null => {
    const list = toUiMessages(value.messages);
    if (list) {
      return list;
    }

    if (isRecord(value.message)) {
      const single = toUiMessage(value.message);
      if (single) {
        return [single];
      }
    }

    if (typeof value.input === "string" && value.input.trim().length > 0) {
      return [toUserMessage(value.input.trim())];
    }

    if (typeof value.prompt === "string" && value.prompt.trim().length > 0) {
      return [toUserMessage(value.prompt.trim())];
    }

    return null;
  };

  try {
    const payload = await request.json();
    if (!isRecord(payload)) {
      return null;
    }

    const body = isRecord(payload.body) ? payload.body : payload;
    const messages = extractMessages(body) ?? (body === payload ? null : extractMessages(payload));
    if (!messages || messages.length === 0) {
      return null;
    }

    const chatId =
      (typeof body.chatId === "string" && body.chatId.trim().length > 0
        ? body.chatId.trim()
        : typeof body.id === "string" && body.id.trim().length > 0
          ? body.id.trim()
          : typeof payload.chatId === "string" && payload.chatId.trim().length > 0
            ? payload.chatId.trim()
            : typeof payload.id === "string" && payload.id.trim().length > 0
              ? payload.id.trim()
              : undefined);
    const conversationTitle =
      typeof body.conversationTitle === "string" && body.conversationTitle.trim().length > 0
        ? body.conversationTitle.trim()
        : typeof payload.conversationTitle === "string" && payload.conversationTitle.trim().length > 0
          ? payload.conversationTitle.trim()
          : undefined;
    const metadata =
      isRecord(body.metadata) ? body.metadata : isRecord(payload.metadata) ? payload.metadata : undefined;
    return {
      messages,
      chatId,
      conversationTitle,
      metadata,
    };
  } catch {
    return null;
  }
};

export const parseCreateInstanceRequest = async (request: Request): Promise<GuiCreateInstanceRequest | null> => {
  try {
    const payload = await request.json();
    if (!isRecord(payload) || typeof payload.name !== "string") {
      return null;
    }
    const name = payload.name.trim();
    if (name.length === 0) {
      return null;
    }
    const pin = typeof payload.userPin === "string" && payload.userPin.trim().length > 0 ? payload.userPin.trim() : undefined;
    const safetyProfile =
      payload.safetyProfile === "safe" || payload.safetyProfile === "dangerous" || payload.safetyProfile === "veryDangerous"
        ? payload.safetyProfile
        : undefined;

    return {
      name,
      userPin: pin,
      safetyProfile,
    };
  } catch {
    return null;
  }
};

export const parseSignInRequest = async (request: Request): Promise<GuiSignInInstanceRequest | null> => {
  try {
    const payload = await request.json();
    if (!isRecord(payload) || typeof payload.localInstanceId !== "string") {
      return null;
    }
    const localInstanceId = payload.localInstanceId.trim();
    if (!localInstanceId) {
      return null;
    }
    const userPin = typeof payload.userPin === "string" && payload.userPin.trim().length > 0 ? payload.userPin.trim() : undefined;
    return { localInstanceId, userPin };
  } catch {
    return null;
  }
};

export const parseDispatcherTestRequest = async (request: Request): Promise<DispatcherTestRequest | null> => {
  try {
    const payload = await request.json();
    if (!isRecord(payload)) {
      return {
        message: "dispatcher-test",
        waitMs: DISPATCH_TEST_DEFAULT_WAIT_MS,
      };
    }

    const message =
      typeof payload.message === "string" && payload.message.trim().length > 0
        ? payload.message.trim()
        : "dispatcher-test";
    const waitMsRaw = typeof payload.waitMs === "number" ? payload.waitMs : DISPATCH_TEST_DEFAULT_WAIT_MS;
    const waitMs = Math.max(0, Math.min(DISPATCH_TEST_MAX_WAIT_MS, Math.trunc(waitMsRaw)));
    return { message, waitMs };
  } catch {
    return null;
  }
};

export const parseUpdateVaultRequest = async (request: Request): Promise<GuiUpdateVaultRequest | null> => {
  try {
    const payload = await request.json();
    if (!isRecord(payload) || typeof payload.content !== "string") {
      return null;
    }
    return {
      content: payload.content,
    };
  } catch {
    return null;
  }
};

export const parseUpsertSecretRequest = async (request: Request): Promise<GuiUpsertSecretRequest | null> => {
  try {
    const payload = await request.json();
    if (!isRecord(payload) || typeof payload.optionId !== "string" || typeof payload.value !== "string") {
      return null;
    }
    const optionId = payload.optionId.trim();
    if (!optionId) {
      return null;
    }
    const source = payload.source === "public" || payload.source === "custom" ? payload.source : undefined;
    const publicRpcId =
      payload.publicRpcId === null || typeof payload.publicRpcId === "string" ? payload.publicRpcId : undefined;
    return {
      optionId,
      value: payload.value,
      source,
      publicRpcId,
    };
  } catch {
    return null;
  }
};

export const parseDeleteSecretRequest = async (request: Request): Promise<GuiDeleteSecretRequest | null> => {
  try {
    const payload = await request.json();
    if (!isRecord(payload) || typeof payload.optionId !== "string") {
      return null;
    }
    const optionId = payload.optionId.trim();
    if (!optionId) {
      return null;
    }
    return { optionId };
  } catch {
    return null;
  }
};
