import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { createOpenAI } from "@ai-sdk/openai";
import type {
  GuiActivityEntry,
  GuiActivityResponse,
  GuiBootstrapResponse,
  GuiChatRequest,
  GuiChatResponse,
  GuiCreateInstanceRequest,
  GuiCreateInstanceResponse,
  GuiInstanceProfileView,
  GuiInstancesResponse,
  GuiQueueJobView,
  GuiQueueResponse,
  GuiSignInInstanceRequest,
  GuiSignInInstanceResponse,
} from "@trenchclaw/types";
import { convertToModelMessages, createGateway, stepCountIs, streamText, tool, type LanguageModel, type UIMessage } from "ai";
import type { RuntimeBootstrap } from "../../trenchclaw/src/runtime/bootstrap";
import { resolveLlmProviderConfigFromEnv } from "../../trenchclaw/src/ai/llm/config";
import { z } from "zod";

const GUI_CONVERSATION_ID = "gui-main";
const MAX_ACTIVITY_ITEMS = 250;
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,accept",
};
const CORE_APP_ROOT = existsSync(path.join(process.cwd(), "../trenchclaw/src"))
  ? path.resolve(process.cwd(), "../trenchclaw")
  : process.cwd();
const INSTANCE_DIRECTORY = path.join(CORE_APP_ROOT, "src/ai/brain/protected/instance");

type RuntimeSafetyProfile = "safe" | "dangerous" | "veryDangerous";

interface InstanceDocument {
  instance: {
    name: string;
    localInstanceId: string;
    userPin: string | null;
  };
  runtime: {
    safetyProfile: RuntimeSafetyProfile;
    createdAt: string;
    updatedAt: string;
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const createMessageId = (): string => crypto.randomUUID();

const trimOrUndefined = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

const resolveStreamingModel = (): LanguageModel => {
  const gatewayApiKey = trimOrUndefined(process.env.AI_GATEWAY_API_KEY);
  if (gatewayApiKey) {
    const gateway = createGateway({ apiKey: gatewayApiKey });
    return gateway(trimOrUndefined(process.env.TRENCHCLAW_AI_MODEL) ?? "anthropic/claude-sonnet-4.5");
  }

  const llmConfig = resolveLlmProviderConfigFromEnv();
  if (!llmConfig) {
    throw new Error(
      "No model provider configured. Set AI_GATEWAY_API_KEY or your TRENCHCLAW/OpenAI provider env vars.",
    );
  }

  const openai = createOpenAI({
    apiKey: llmConfig.apiKey,
    baseURL: llmConfig.baseURL,
  });
  return openai.responses(llmConfig.model);
};

const mapJobToView = (job: ReturnType<RuntimeBootstrap["stateStore"]["listJobs"]>[number]): GuiQueueJobView => ({
  id: job.id,
  botId: job.botId,
  routineName: job.routineName,
  status: job.status,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
  nextRunAt: typeof job.nextRunAt === "number" ? job.nextRunAt : null,
  cyclesCompleted: job.cyclesCompleted,
});

const parseChatRequest = async (request: Request): Promise<GuiChatRequest | null> => {
  try {
    const payload = await request.json();
    if (!isRecord(payload) || typeof payload.message !== "string") {
      return null;
    }
    const message = payload.message.trim();
    if (message.length === 0) {
      return null;
    }
    return { message };
  } catch {
    return null;
  }
};

const parseUiChatRequest = async (request: Request): Promise<{ messages: UIMessage[] } | null> => {
  try {
    const payload = await request.json();
    if (!isRecord(payload) || !Array.isArray(payload.messages)) {
      return null;
    }
    return {
      messages: payload.messages as UIMessage[],
    };
  } catch {
    return null;
  }
};

const parseCreateInstanceRequest = async (request: Request): Promise<GuiCreateInstanceRequest | null> => {
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

const parseSignInRequest = async (request: Request): Promise<GuiSignInInstanceRequest | null> => {
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

const toInstanceView = (fileName: string, document: InstanceDocument): GuiInstanceProfileView => ({
  fileName,
  localInstanceId: document.instance.localInstanceId,
  name: document.instance.name,
  safetyProfile: document.runtime.safetyProfile,
  userPinRequired: document.instance.userPin !== null,
  createdAt: document.runtime.createdAt,
  updatedAt: document.runtime.updatedAt,
});

const parseInstanceDocument = (raw: string): InstanceDocument | null => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.instance) || !isRecord(parsed.runtime)) {
      return null;
    }
    const instanceName = typeof parsed.instance.name === "string" ? parsed.instance.name.trim() : "";
    const localInstanceId = typeof parsed.instance.localInstanceId === "string" ? parsed.instance.localInstanceId.trim() : "";
    const userPin = parsed.instance.userPin === null || typeof parsed.instance.userPin === "string" ? parsed.instance.userPin : null;
    const safetyProfile =
      parsed.runtime.safetyProfile === "safe" ||
      parsed.runtime.safetyProfile === "dangerous" ||
      parsed.runtime.safetyProfile === "veryDangerous"
        ? parsed.runtime.safetyProfile
        : "dangerous";
    const createdAt = typeof parsed.runtime.createdAt === "string" ? parsed.runtime.createdAt : new Date().toISOString();
    const updatedAt = typeof parsed.runtime.updatedAt === "string" ? parsed.runtime.updatedAt : createdAt;

    if (!instanceName || !localInstanceId) {
      return null;
    }

    return {
      instance: {
        name: instanceName,
        localInstanceId,
        userPin: userPin ?? null,
      },
      runtime: {
        safetyProfile,
        createdAt,
        updatedAt,
      },
    };
  } catch {
    return null;
  }
};

const readInstanceFiles = async (): Promise<Array<{ fileName: string; document: InstanceDocument }>> => {
  await mkdir(INSTANCE_DIRECTORY, { recursive: true });
  const entries = await readdir(INSTANCE_DIRECTORY, { withFileTypes: true, encoding: "utf8" });
  const files = entries
    .filter((entry) => entry.isFile() && /^user-\d+\.json$/u.test(entry.name))
    .map((entry) => entry.name)
    .toSorted((a, b) => a.localeCompare(b));

  const loaded = await Promise.all(
    files.map(async (fileName) => {
      const absolutePath = path.join(INSTANCE_DIRECTORY, fileName);
      const content = await readFile(absolutePath, "utf8");
      const document = parseInstanceDocument(content);
      return document ? { fileName, document } : null;
    }),
  );

  return loaded.filter((entry): entry is { fileName: string; document: InstanceDocument } => entry !== null);
};

const nextInstanceNumberFromFiles = (fileNames: string[]): number => {
  const numbers = fileNames
    .map((fileName) => /^user-(\d+)\.json$/u.exec(fileName)?.[1])
    .filter((value): value is string => value !== undefined)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (numbers.length === 0) {
    return 1;
  }

  return Math.max(...numbers) + 1;
};

export class RuntimeGuiTransport {
  private readonly activity: GuiActivityEntry[] = [];
  private readonly unsubscribers: Array<() => void> = [];
  private activeInstance: GuiInstanceProfileView | null = null;

  constructor(private readonly runtime: RuntimeBootstrap) {
    this.addActivity("runtime", "Runtime transport initialized");

    this.unsubscribers.push(
      this.runtime.eventBus.on("queue:enqueue", (event) => {
        this.addActivity(
          "queue",
          `Queued ${event.payload.routineName} for ${event.payload.botId} (#${event.payload.queuePosition})`,
        );
      }),
    );

    this.unsubscribers.push(
      this.runtime.eventBus.on("queue:dequeue", (event) => {
        this.addActivity("queue", `Started ${event.payload.routineName} for ${event.payload.botId}`);
      }),
    );

    this.unsubscribers.push(
      this.runtime.eventBus.on("queue:complete", (event) => {
        this.addActivity(
          "queue",
          `Confirmed ${event.payload.routineName} for ${event.payload.botId} (${event.payload.status})`,
        );
      }),
    );
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
  }

  getBootstrap(): GuiBootstrapResponse {
    return {
      profile: this.runtime.settings.profile,
      llmEnabled: this.runtime.llm !== null,
      activeInstance: this.activeInstance,
      runtime: this.runtime.describe(),
    };
  }

  getQueue(): GuiQueueResponse {
    const jobs = this.runtime.stateStore.listJobs().toSorted((a, b) => b.updatedAt - a.updatedAt).map(mapJobToView);
    return { jobs };
  }

  getActivity(limit = 100): GuiActivityResponse {
    const normalizedLimit = Math.max(1, Math.trunc(limit));
    return {
      entries: this.activity.slice(0, normalizedLimit),
    };
  }

  async listInstances(): Promise<GuiInstancesResponse> {
    const instances = (await readInstanceFiles()).map((entry) => toInstanceView(entry.fileName, entry.document));
    return { instances };
  }

  async createInstance(payload: GuiCreateInstanceRequest): Promise<GuiCreateInstanceResponse> {
    await mkdir(INSTANCE_DIRECTORY, { recursive: true });
    const existing = await readInstanceFiles();
    const nextNumber = nextInstanceNumberFromFiles(existing.map((entry) => entry.fileName));
    const localInstanceId = String(nextNumber).padStart(4, "0");
    const fileName = `user-${nextNumber}.json`;
    const nowIso = new Date().toISOString();
    const safetyProfile = payload.safetyProfile ?? "dangerous";

    const document: InstanceDocument = {
      instance: {
        name: payload.name.trim(),
        localInstanceId,
        userPin: payload.userPin?.trim() ? payload.userPin.trim() : null,
      },
      runtime: {
        safetyProfile,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    };

    await writeFile(path.join(INSTANCE_DIRECTORY, fileName), `${JSON.stringify(document, null, 2)}\n`, "utf8");
    const instance = toInstanceView(fileName, document);
    this.activeInstance = instance;
    process.env.TRENCHCLAW_OPERATOR_ALIAS = instance.name;
    process.env.TRENCHCLAW_PROFILE = instance.safetyProfile;
    this.addActivity("runtime", `Instance created: ${instance.name} (${instance.localInstanceId})`);
    return { instance };
  }

  async signInInstance(payload: GuiSignInInstanceRequest): Promise<GuiSignInInstanceResponse> {
    const instances = await readInstanceFiles();
    const target = instances.find((entry) => entry.document.instance.localInstanceId === payload.localInstanceId);

    if (!target) {
      throw new Error(`Instance not found: ${payload.localInstanceId}`);
    }

    const requiredPin = target.document.instance.userPin;
    if (requiredPin !== null && requiredPin !== (payload.userPin ?? "")) {
      throw new Error("Invalid PIN");
    }

    const instance = toInstanceView(target.fileName, target.document);
    this.activeInstance = instance;
    process.env.TRENCHCLAW_OPERATOR_ALIAS = instance.name;
    process.env.TRENCHCLAW_PROFILE = instance.safetyProfile;
    this.addActivity("runtime", `Instance signed in: ${instance.name} (${instance.localInstanceId})`);
    return { instance };
  }

  async sendChat(message: string): Promise<GuiChatResponse> {
    const now = Date.now();
    const conversation =
      this.runtime.stateStore.getConversation(GUI_CONVERSATION_ID) ??
      (() => {
        const created = {
          id: GUI_CONVERSATION_ID,
          title: "GUI Main",
          createdAt: now,
          updatedAt: now,
        };
        this.runtime.stateStore.saveConversation(created);
        return created;
      })();

    this.runtime.stateStore.saveChatMessage({
      id: createMessageId(),
      conversationId: conversation.id,
      role: "user",
      content: message,
      createdAt: now,
    });
    this.runtime.stateStore.saveConversation({
      ...conversation,
      updatedAt: now,
    });
    this.addActivity("chat", `Prompt received: ${message.slice(0, 72)}${message.length > 72 ? "..." : ""}`);

    if (!this.runtime.llm) {
      const fallback = "LLM is not configured. Set provider credentials to enable live chat responses.";
      const responseTime = Date.now();
      this.runtime.stateStore.saveChatMessage({
        id: createMessageId(),
        conversationId: conversation.id,
        role: "assistant",
        content: fallback,
        createdAt: responseTime,
      });
      this.runtime.stateStore.saveConversation({
        ...conversation,
        updatedAt: responseTime,
      });
      this.addActivity("chat", "Response confirmed (LLM disabled)");
      return {
        reply: fallback,
        llmEnabled: false,
      };
    }

    try {
      const result = await this.runtime.llm.generate({
        prompt: message,
        maxOutputTokens: 900,
      });
      const responseTime = Date.now();
      this.runtime.stateStore.saveChatMessage({
        id: createMessageId(),
        conversationId: conversation.id,
        role: "assistant",
        content: result.text,
        createdAt: responseTime,
      });
      this.runtime.stateStore.saveConversation({
        ...conversation,
        updatedAt: responseTime,
      });
      this.addActivity("chat", "Response confirmed");
      return {
        reply: result.text,
        llmEnabled: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.addActivity("chat", `Response failed: ${errorMessage.slice(0, 100)}`);
      throw error;
    }
  }

  async streamChat(messages: UIMessage[]): Promise<Response> {
    const model = resolveStreamingModel();
    const result = streamText({
      model,
      messages: await convertToModelMessages(messages),
      stopWhen: stepCountIs(5),
      tools: {
        weather: tool({
          description: "Get the weather in a location (fahrenheit)",
          inputSchema: z.object({
            location: z.string().describe("The location to get the weather for"),
          }),
          execute: async ({ location }) => {
            const temperature = Math.round(Math.random() * (90 - 32) + 32);
            return { location, temperature };
          },
        }),
        convertFahrenheitToCelsius: tool({
          description: "Convert a temperature in fahrenheit to celsius",
          inputSchema: z.object({
            temperature: z.number().describe("The temperature in fahrenheit to convert"),
          }),
          execute: async ({ temperature }) => {
            const celsius = Math.round((temperature - 32) * (5 / 9));
            return { celsius };
          },
        }),
      },
    });

    return result.toUIMessageStreamResponse({
      headers: CORS_HEADERS,
    });
  }

  createApiHandler(): (request: Request) => Promise<Response> {
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
          return await this.streamChat(payload.messages);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return Response.json({ error: errorMessage }, { status: 500, headers: CORS_HEADERS });
        }
      }

      if (request.method === "GET" && url.pathname === "/api/gui/bootstrap") {
        return Response.json(this.getBootstrap(), { headers: CORS_HEADERS });
      }

      if (request.method === "GET" && url.pathname === "/api/gui/queue") {
        return Response.json(this.getQueue(), { headers: CORS_HEADERS });
      }

      if (request.method === "GET" && url.pathname === "/api/gui/activity") {
        const limitParam = Number(url.searchParams.get("limit") ?? 100);
        const limit = Number.isFinite(limitParam) ? limitParam : 100;
        return Response.json(this.getActivity(limit), { headers: CORS_HEADERS });
      }

      if (request.method === "GET" && url.pathname === "/api/gui/instances") {
        try {
          return Response.json(await this.listInstances(), { headers: CORS_HEADERS });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return Response.json({ error: errorMessage }, { status: 500, headers: CORS_HEADERS });
        }
      }

      if (request.method === "POST" && url.pathname === "/api/gui/instances") {
        const payload = await parseCreateInstanceRequest(request);
        if (!payload) {
          return Response.json({ error: "Invalid instance payload" }, { status: 400, headers: CORS_HEADERS });
        }

        try {
          return Response.json(await this.createInstance(payload), { headers: CORS_HEADERS });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return Response.json({ error: errorMessage }, { status: 500, headers: CORS_HEADERS });
        }
      }

      if (request.method === "POST" && url.pathname === "/api/gui/instances/sign-in") {
        const payload = await parseSignInRequest(request);
        if (!payload) {
          return Response.json({ error: "Invalid sign-in payload" }, { status: 400, headers: CORS_HEADERS });
        }

        try {
          return Response.json(await this.signInInstance(payload), { headers: CORS_HEADERS });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return Response.json({ error: errorMessage }, { status: 401, headers: CORS_HEADERS });
        }
      }

      if (request.method === "POST" && url.pathname === "/api/gui/chat") {
        const payload = await parseChatRequest(request);
        if (!payload) {
          return Response.json({ error: "Missing message" }, { status: 400, headers: CORS_HEADERS });
        }

        try {
          return Response.json(await this.sendChat(payload.message), { headers: CORS_HEADERS });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return Response.json({ error: errorMessage }, { status: 500, headers: CORS_HEADERS });
        }
      }

      return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
    };
  }

  private addActivity(source: GuiActivityEntry["source"], summary: string): void {
    this.activity.unshift({
      id: createMessageId(),
      source,
      summary,
      timestamp: Date.now(),
    });
    this.activity.splice(MAX_ACTIVITY_ITEMS);
  }
}

export const createWebGuiApiHandler = (runtime: RuntimeBootstrap): ((request: Request) => Promise<Response>) => {
  const transport = new RuntimeGuiTransport(runtime);
  return transport.createApiHandler();
};
