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
): Promise<{ messages: UIMessage[]; chatId?: string; conversationTitle?: string } | null> => {
  try {
    const payload = await request.json();
    if (!isRecord(payload) || !Array.isArray(payload.messages)) {
      return null;
    }
    const chatId =
      (typeof payload.chatId === "string" && payload.chatId.trim().length > 0
        ? payload.chatId.trim()
        : typeof payload.id === "string" && payload.id.trim().length > 0
          ? payload.id.trim()
          : undefined);
    const conversationTitle =
      typeof payload.conversationTitle === "string" && payload.conversationTitle.trim().length > 0
        ? payload.conversationTitle.trim()
        : undefined;
    return {
      messages: payload.messages as UIMessage[],
      chatId,
      conversationTitle,
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
