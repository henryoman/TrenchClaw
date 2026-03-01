import { CORS_HEADERS } from "./constants";
import type { RuntimeGuiDomainContext } from "./contracts";
import {
  parseCreateInstanceRequest,
  parseDeleteSecretRequest,
  parseDispatcherTestRequest,
  parseSignInRequest,
  parseUiChatRequest,
  parseUpdateVaultRequest,
  parseUpsertSecretRequest,
} from "./parsers";
import { streamChat, getConversationMessages, getConversations } from "./domains/chat";
import { createInstance, listInstances, signInInstance } from "./domains/instances";
import { getActivity, getBootstrap, getQueue } from "./domains/runtime-panels";
import { runDispatcherQueueTest } from "./domains/tests";
import { deleteSecret, getSecrets, getVault, updateVault, upsertSecret } from "./domains/vault-secrets";

const toErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const createGuiApiHandler = (context: RuntimeGuiDomainContext): ((request: Request) => Promise<Response>) => {
  return async (request: Request) => {
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && (url.pathname.startsWith("/api/gui/") || url.pathname === "/api/chat")) {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    if (request.method === "POST" && url.pathname === "/api/chat") {
      const payload = await parseUiChatRequest(request);
      if (!payload) {
        return Response.json({ error: "Invalid chat payload" }, { status: 400, headers: CORS_HEADERS });
      }

      try {
        return await streamChat(context, payload.messages, {
          chatId: payload.chatId,
          conversationTitle: payload.conversationTitle,
        });
      } catch (error) {
        return Response.json({ error: toErrorMessage(error) }, { status: 500, headers: CORS_HEADERS });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/gui/tests/dispatcher") {
      const payload = await parseDispatcherTestRequest(request);
      if (!payload) {
        return Response.json({ error: "Invalid dispatcher test payload" }, { status: 400, headers: CORS_HEADERS });
      }

      try {
        return Response.json(await runDispatcherQueueTest(context, payload), { headers: CORS_HEADERS });
      } catch (error) {
        return Response.json({ error: toErrorMessage(error) }, { status: 500, headers: CORS_HEADERS });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/gui/bootstrap") {
      return Response.json(getBootstrap(context), { headers: CORS_HEADERS });
    }

    if (request.method === "GET" && url.pathname === "/api/gui/queue") {
      return Response.json(getQueue(context), { headers: CORS_HEADERS });
    }

    if (request.method === "GET" && url.pathname === "/api/gui/activity") {
      const limitParam = Number(url.searchParams.get("limit") ?? 100);
      const limit = Number.isFinite(limitParam) ? limitParam : 100;
      return Response.json(getActivity(context, limit), { headers: CORS_HEADERS });
    }

    if (request.method === "GET" && url.pathname === "/api/gui/conversations") {
      const limitParam = Number(url.searchParams.get("limit") ?? 100);
      const limit = Number.isFinite(limitParam) ? limitParam : 100;
      return Response.json(getConversations(context, limit), { headers: CORS_HEADERS });
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/gui/conversations/") && url.pathname.endsWith("/messages")) {
      const prefix = "/api/gui/conversations/";
      const suffix = "/messages";
      const encodedConversationId = url.pathname.slice(prefix.length, -suffix.length);
      const conversationId = decodeURIComponent(encodedConversationId);
      const limitParam = Number(url.searchParams.get("limit") ?? 500);
      const limit = Number.isFinite(limitParam) ? limitParam : 500;

      try {
        return Response.json(getConversationMessages(context, conversationId, limit), { headers: CORS_HEADERS });
      } catch (error) {
        return Response.json({ error: toErrorMessage(error) }, { status: 404, headers: CORS_HEADERS });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/gui/instances") {
      try {
        return Response.json(await listInstances(), { headers: CORS_HEADERS });
      } catch (error) {
        return Response.json({ error: toErrorMessage(error) }, { status: 500, headers: CORS_HEADERS });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/gui/instances") {
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

    if (request.method === "POST" && url.pathname === "/api/gui/instances/sign-in") {
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

    if (request.method === "GET" && url.pathname === "/api/gui/vault") {
      try {
        return Response.json(await getVault(), { headers: CORS_HEADERS });
      } catch (error) {
        return Response.json({ error: toErrorMessage(error) }, { status: 500, headers: CORS_HEADERS });
      }
    }

    if (request.method === "PUT" && url.pathname === "/api/gui/vault") {
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

    if (request.method === "GET" && url.pathname === "/api/gui/secrets") {
      try {
        return Response.json(await getSecrets(), { headers: CORS_HEADERS });
      } catch (error) {
        return Response.json({ error: toErrorMessage(error) }, { status: 500, headers: CORS_HEADERS });
      }
    }

    if (request.method === "PUT" && url.pathname === "/api/gui/secrets") {
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

    if (request.method === "DELETE" && url.pathname === "/api/gui/secrets") {
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

    return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
  };
};
