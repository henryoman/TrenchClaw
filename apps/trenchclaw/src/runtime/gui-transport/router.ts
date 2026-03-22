import { CORS_HEADERS } from "./constants";
import type { RuntimeSurfaceContext } from "./contracts";
import {
  parseUpdateAiSettingsRequest,
  parseCreateInstanceRequest,
  parseDeleteSecretRequest,
  parseSignInRequest,
  parseUpdateTradingSettingsRequest,
  parseUpdateWakeupSettingsRequest,
  parseUiChatRequest,
  parseUpdateVaultRequest,
  parseUpsertSecretRequest,
} from "./parsers";
import { getAiSettings, updateAiSettings } from "./domains/ai-settings";
import { deleteConversation, streamChat, getConversationMessages, getConversations } from "./domains/chat";
import { createInstance, listInstances, signInInstance } from "./domains/instances";
import { runLlmCheck } from "./domains/llm-check";
import { getActivity, getBootstrap, getQueue, getSchedule, streamRuntimeEvents } from "./domains/runtime-panels";
import { getSolPrice } from "../market/sol-price";
import { getTradingSettings, updateTradingSettings } from "./domains/trading-settings";
import { getWakeupSettings, updateWakeupSettings } from "./domains/wakeup-settings";
import { deleteSecret, getSecrets, getVault, updateVault, upsertSecret } from "./domains/vault-secrets";
import { listWalletTree, readWalletBackupFile } from "./domains/wallets";

const LEGACY_GUI_API_BASE_PATH = "/api/gui";
const RUNTIME_APP_API_BASE_PATH = "/v1/app";
const APP_API_BASE_PATHS = [RUNTIME_APP_API_BASE_PATH, LEGACY_GUI_API_BASE_PATH] as const;

const toErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const toErrorPayloadV1 = (code: string, message: string, details?: unknown): { error: { code: string; message: string; details?: unknown } } => ({
  error: {
    code,
    message,
    ...(details === undefined ? {} : { details }),
  },
});

const jsonWithCors = (payload: unknown, status = 200): Response => Response.json(payload, { status, headers: CORS_HEADERS });

const isAppApiPath = (pathname: string): boolean =>
  APP_API_BASE_PATHS.some((basePath) => pathname === basePath || pathname.startsWith(`${basePath}/`));

const matchesAppRoute = (pathname: string, suffix: string): boolean =>
  APP_API_BASE_PATHS.some((basePath) => pathname === `${basePath}${suffix}`);

const extractConversationRoute = (
  pathname: string,
): { conversationId: string; isMessagesRoute: boolean } | null => {
  for (const basePath of APP_API_BASE_PATHS) {
    const prefix = `${basePath}/conversations/`;
    if (!pathname.startsWith(prefix)) {
      continue;
    }

    const encodedTail = pathname.slice(prefix.length);
    if (!encodedTail) {
      return null;
    }

    const messagesSuffix = "/messages";
    if (encodedTail.endsWith(messagesSuffix)) {
      const encodedConversationId = encodedTail.slice(0, -messagesSuffix.length);
      if (!encodedConversationId) {
        return null;
      }
      return {
        conversationId: decodeURIComponent(encodedConversationId),
        isMessagesRoute: true,
      };
    }

    return {
      conversationId: decodeURIComponent(encodedTail),
      isMessagesRoute: false,
    };
  }

  return null;
};

export const createRuntimeSurfaceHandler = (context: RuntimeSurfaceContext): ((request: Request) => Promise<Response>) => {
  return async (request: Request) => {
    const verboseApiLogs = process.env.TRENCHCLAW_API_LOGS === "1";
    const url = new URL(request.url);
    const requestId = crypto.randomUUID().slice(0, 8);
    const startedAt = Date.now();
    const logResponse = (response: Response): Response => {
      if (verboseApiLogs) {
        console.log(
          `[api] [${requestId}] ${request.method} ${url.pathname}${url.search} -> ${response.status} (${Date.now() - startedAt}ms)`,
        );
      }
      return response;
    };

    if (verboseApiLogs) {
      console.log(`[api] [${requestId}] ${request.method} ${url.pathname}${url.search} <- start`);
    }

    if (request.method === "OPTIONS" && (isAppApiPath(url.pathname) || url.pathname.startsWith("/v1/"))) {
      return logResponse(new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      }));
    }

    if (request.method === "GET" && url.pathname === "/v1/health") {
      return logResponse(jsonWithCors({
        ok: true,
        service: "trenchclaw-runtime",
      }));
    }

    if (request.method === "GET" && url.pathname === "/v1/runtime") {
      const runtime = context.runtime.describe();
      return logResponse(jsonWithCors({
        profile: runtime.profile,
        llmEnabled: runtime.llmEnabled,
        llmModel: runtime.llmModel,
        version: "v1",
      }));
    }

    if (request.method === "POST" && url.pathname === "/v1/chat/stream") {
      const payload = await parseUiChatRequest(request);
      if (!payload) {
        return logResponse(jsonWithCors(toErrorPayloadV1("invalid_payload", "Invalid chat payload"), 400));
      }

      try {
        return logResponse(await streamChat(context, payload.messages, {
          chatId: payload.chatId,
          conversationTitle: payload.conversationTitle,
          lane: payload.lane,
          abortSignal: request.signal,
        }));
      } catch (error) {
        const message = toErrorMessage(error);
        context.addActivity("runtime", `Chat stream failed: ${message}`);
        return logResponse(jsonWithCors(toErrorPayloadV1("runtime_error", message), 500));
      }
    }

    if (request.method === "POST" && matchesAppRoute(url.pathname, "/client-error")) {
      try {
        const payload = await request.json();
        const source =
          payload && typeof payload === "object" && "source" in payload && typeof payload.source === "string"
            ? payload.source
            : "unknown";
        const message =
          payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
            ? payload.message
            : "Unknown client error";
        const metadata =
          payload && typeof payload === "object" && "metadata" in payload && payload.metadata && typeof payload.metadata === "object"
            ? payload.metadata
            : undefined;
        const summary = `Client error [${source}]: ${message}`;
        context.addActivity("runtime", summary);
        console.error("[client-error]", summary, metadata ?? {});
        return Response.json({ ok: true }, { headers: CORS_HEADERS });
      } catch (error) {
        return Response.json({ error: toErrorMessage(error) }, { status: 400, headers: CORS_HEADERS });
      }
    }

    if (request.method === "GET" && matchesAppRoute(url.pathname, "/bootstrap")) {
      return Response.json(await getBootstrap(context), { headers: CORS_HEADERS });
    }

    if (request.method === "GET" && matchesAppRoute(url.pathname, "/sol-price")) {
      return Response.json(await getSolPrice(), { headers: CORS_HEADERS });
    }

    if (request.method === "GET" && matchesAppRoute(url.pathname, "/events")) {
      return streamRuntimeEvents(context, request.signal);
    }

    if (request.method === "GET" && matchesAppRoute(url.pathname, "/queue")) {
      return Response.json(getQueue(context), { headers: CORS_HEADERS });
    }

    if (request.method === "GET" && matchesAppRoute(url.pathname, "/schedule")) {
      return Response.json(getSchedule(context), { headers: CORS_HEADERS });
    }

    if (request.method === "GET" && matchesAppRoute(url.pathname, "/activity")) {
      const limitParam = Number(url.searchParams.get("limit") ?? 100);
      const limit = Number.isFinite(limitParam) ? limitParam : 100;
      return Response.json(getActivity(context, limit), { headers: CORS_HEADERS });
    }

    if (request.method === "GET" && matchesAppRoute(url.pathname, "/conversations")) {
      const limitParam = Number(url.searchParams.get("limit") ?? 100);
      const limit = Number.isFinite(limitParam) ? limitParam : 100;
      return Response.json(getConversations(context, limit), { headers: CORS_HEADERS });
    }

    const conversationRoute = extractConversationRoute(url.pathname);
    if (request.method === "DELETE" && conversationRoute && !conversationRoute.isMessagesRoute) {
      if (!conversationRoute.conversationId) {
        return Response.json({ error: "Conversation id is required" }, { status: 400, headers: CORS_HEADERS });
      }

      try {
        return Response.json(deleteConversation(context, conversationRoute.conversationId), { headers: CORS_HEADERS });
      } catch (error) {
        return Response.json({ error: toErrorMessage(error) }, { status: 404, headers: CORS_HEADERS });
      }
    }

    if (request.method === "GET" && conversationRoute?.isMessagesRoute) {
      const limitParam = Number(url.searchParams.get("limit") ?? 500);
      const limit = Number.isFinite(limitParam) ? limitParam : 500;

      try {
        return Response.json(getConversationMessages(context, conversationRoute.conversationId, limit), { headers: CORS_HEADERS });
      } catch (error) {
        return Response.json({ error: toErrorMessage(error) }, { status: 404, headers: CORS_HEADERS });
      }
    }

    if (request.method === "GET" && matchesAppRoute(url.pathname, "/instances")) {
      try {
        return Response.json(await listInstances(), { headers: CORS_HEADERS });
      } catch (error) {
        return Response.json({ error: toErrorMessage(error) }, { status: 500, headers: CORS_HEADERS });
      }
    }

    if (request.method === "POST" && matchesAppRoute(url.pathname, "/instances")) {
      const payload = await parseCreateInstanceRequest(request);
      if (!payload) {
        return Response.json({ error: "Invalid instance payload" }, { status: 400, headers: CORS_HEADERS });
      }

      try {
        return Response.json(await createInstance(context, payload), { headers: CORS_HEADERS });
      } catch (error) {
        return Response.json({ error: toErrorMessage(error) }, { status: 500, headers: CORS_HEADERS });
      }
    }

    if (request.method === "POST" && matchesAppRoute(url.pathname, "/instances/sign-in")) {
      const payload = await parseSignInRequest(request);
      if (!payload) {
        return Response.json({ error: "Invalid sign-in payload" }, { status: 400, headers: CORS_HEADERS });
      }

      try {
        return Response.json(await signInInstance(context, payload), { headers: CORS_HEADERS });
      } catch (error) {
        return Response.json({ error: toErrorMessage(error) }, { status: 401, headers: CORS_HEADERS });
      }
    }

    if (request.method === "GET" && matchesAppRoute(url.pathname, "/vault")) {
      try {
        return Response.json(await getVault(context), { headers: CORS_HEADERS });
      } catch (error) {
        return Response.json({ error: toErrorMessage(error) }, { status: 500, headers: CORS_HEADERS });
      }
    }

    if (request.method === "PUT" && matchesAppRoute(url.pathname, "/vault")) {
      const payload = await parseUpdateVaultRequest(request);
      if (!payload) {
        return Response.json({ error: "Invalid vault payload" }, { status: 400, headers: CORS_HEADERS });
      }

      try {
        return Response.json(await updateVault(context, payload), { headers: CORS_HEADERS });
      } catch (error) {
        return Response.json({ error: toErrorMessage(error) }, { status: 400, headers: CORS_HEADERS });
      }
    }

    if (request.method === "GET" && matchesAppRoute(url.pathname, "/ai-settings")) {
      try {
        return Response.json(await getAiSettings(), { headers: CORS_HEADERS });
      } catch (error) {
        return Response.json({ error: toErrorMessage(error) }, { status: 500, headers: CORS_HEADERS });
      }
    }

    if (request.method === "PUT" && matchesAppRoute(url.pathname, "/ai-settings")) {
      const payload = await parseUpdateAiSettingsRequest(request);
      if (!payload) {
        return Response.json({ error: "Invalid AI settings payload" }, { status: 400, headers: CORS_HEADERS });
      }

      try {
        return Response.json(await updateAiSettings(context, payload), { headers: CORS_HEADERS });
      } catch (error) {
        return Response.json({ error: toErrorMessage(error) }, { status: 400, headers: CORS_HEADERS });
      }
    }

    if (request.method === "GET" && matchesAppRoute(url.pathname, "/trading-settings")) {
      try {
        return Response.json(await getTradingSettings(context), { headers: CORS_HEADERS });
      } catch (error) {
        return Response.json({ error: toErrorMessage(error) }, { status: 500, headers: CORS_HEADERS });
      }
    }

    if (request.method === "PUT" && matchesAppRoute(url.pathname, "/trading-settings")) {
      const payload = await parseUpdateTradingSettingsRequest(request);
      if (!payload) {
        return Response.json({ error: "Invalid trading settings payload" }, { status: 400, headers: CORS_HEADERS });
      }

      try {
        return Response.json(await updateTradingSettings(context, payload), { headers: CORS_HEADERS });
      } catch (error) {
        return Response.json({ error: toErrorMessage(error) }, { status: 400, headers: CORS_HEADERS });
      }
    }

    if (request.method === "GET" && matchesAppRoute(url.pathname, "/wakeup-settings")) {
      try {
        return Response.json(await getWakeupSettings(context), { headers: CORS_HEADERS });
      } catch (error) {
        return Response.json({ error: toErrorMessage(error) }, { status: 500, headers: CORS_HEADERS });
      }
    }

    if (request.method === "PUT" && matchesAppRoute(url.pathname, "/wakeup-settings")) {
      const payload = await parseUpdateWakeupSettingsRequest(request);
      if (!payload) {
        return Response.json({ error: "Invalid wakeup settings payload" }, { status: 400, headers: CORS_HEADERS });
      }

      try {
        return Response.json(await updateWakeupSettings(context, payload), { headers: CORS_HEADERS });
      } catch (error) {
        return Response.json({ error: toErrorMessage(error) }, { status: 400, headers: CORS_HEADERS });
      }
    }

    if (request.method === "GET" && matchesAppRoute(url.pathname, "/secrets")) {
      try {
        return Response.json(await getSecrets(context), { headers: CORS_HEADERS });
      } catch (error) {
        return Response.json({ error: toErrorMessage(error) }, { status: 500, headers: CORS_HEADERS });
      }
    }

    if (request.method === "PUT" && matchesAppRoute(url.pathname, "/secrets")) {
      const payload = await parseUpsertSecretRequest(request);
      if (!payload) {
        return Response.json({ error: "Invalid secrets payload" }, { status: 400, headers: CORS_HEADERS });
      }
      try {
        return Response.json(await upsertSecret(context, payload), { headers: CORS_HEADERS });
      } catch (error) {
        return Response.json({ error: toErrorMessage(error) }, { status: 400, headers: CORS_HEADERS });
      }
    }

    if (request.method === "DELETE" && matchesAppRoute(url.pathname, "/secrets")) {
      const payload = await parseDeleteSecretRequest(request);
      if (!payload) {
        return Response.json({ error: "Invalid delete secret payload" }, { status: 400, headers: CORS_HEADERS });
      }
      try {
        return Response.json(await deleteSecret(context, payload), { headers: CORS_HEADERS });
      } catch (error) {
        return Response.json({ error: toErrorMessage(error) }, { status: 400, headers: CORS_HEADERS });
      }
    }

    if (request.method === "GET" && matchesAppRoute(url.pathname, "/wallets")) {
      try {
        return Response.json(await listWalletTree(context), { headers: CORS_HEADERS });
      } catch (error) {
        return Response.json({ error: toErrorMessage(error) }, { status: 500, headers: CORS_HEADERS });
      }
    }

    if (request.method === "GET" && matchesAppRoute(url.pathname, "/wallets/download")) {
      const relativePath = (url.searchParams.get("path") ?? "").trim();
      if (!relativePath) {
        return Response.json({ error: "Missing wallet file path" }, { status: 400, headers: CORS_HEADERS });
      }
      try {
        const backup = await readWalletBackupFile(context, relativePath);
        return new Response(backup.content, {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            "content-type": "application/json; charset=utf-8",
            "content-disposition": `attachment; filename="${backup.fileName}"`,
          },
        });
      } catch (error) {
        return Response.json({ error: toErrorMessage(error) }, { status: 404, headers: CORS_HEADERS });
      }
    }

    if (request.method === "GET" && matchesAppRoute(url.pathname, "/llm/check")) {
      try {
        return Response.json(await runLlmCheck(), { headers: CORS_HEADERS });
      } catch (error) {
        return Response.json({ error: toErrorMessage(error) }, { status: 500, headers: CORS_HEADERS });
      }
    }

    return logResponse(new Response("Not Found", { status: 404, headers: CORS_HEADERS }));
  };
};

export const createGuiApiHandler = createRuntimeSurfaceHandler;
