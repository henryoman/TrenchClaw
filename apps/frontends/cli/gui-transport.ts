import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  GuiActivityEntry,
  GuiActivityResponse,
  GuiBootstrapResponse,
  GuiConversationMessagesResponse,
  GuiConversationsResponse,
  GuiConversationView,
  GuiCreateInstanceRequest,
  GuiCreateInstanceResponse,
  GuiInstanceProfileView,
  GuiInstancesResponse,
  GuiQueueJobView,
  GuiQueueResponse,
  GuiSignInInstanceRequest,
  GuiSignInInstanceResponse,
  GuiUpdateVaultRequest,
  GuiUpdateVaultResponse,
  GuiVaultResponse,
} from "@trenchclaw/types";
import type { UIMessage } from "ai";
import { ensureVaultFileExists, parseVaultJsonText } from "../../trenchclaw/src/ai/llm/vault-file";
import type { RuntimeBootstrap } from "../../trenchclaw/src/runtime/bootstrap";
import {
  assertInstanceSystemWritePath,
  assertProtectedNoReadWritePath,
} from "../../trenchclaw/src/runtime/security/write-scope";
import { CORE_APP_ROOT } from "./runtime-paths";

const MAX_ACTIVITY_ITEMS = 250;
const GUI_QUEUE_INCLUDE_HISTORY = process.env.GUI_QUEUE_INCLUDE_HISTORY === "1";
const ACTIVE_JOB_STATUSES = new Set(["pending", "running", "paused"]);
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
  "access-control-allow-headers": "content-type,accept",
};
const INSTANCE_DIRECTORY = path.join(CORE_APP_ROOT, "src/ai/brain/protected/instance");
const NO_READ_DIRECTORY = path.join(CORE_APP_ROOT, "src/ai/brain/protected/no-read");
const VAULT_FILE_PATH = path.join(NO_READ_DIRECTORY, "vault.json");
const VAULT_TEMPLATE_FILE_PATH = path.join(NO_READ_DIRECTORY, "vault.template.json");
const DISPATCH_TEST_DEFAULT_WAIT_MS = 4000;
const DISPATCH_TEST_MAX_WAIT_MS = 20000;

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

interface DispatcherTestRequest {
  message: string;
  waitMs: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const createMessageId = (): string => crypto.randomUUID();

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

const parseUiChatRequest = async (
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

const parseDispatcherTestRequest = async (request: Request): Promise<DispatcherTestRequest | null> => {
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

const parseUpdateVaultRequest = async (request: Request): Promise<GuiUpdateVaultRequest | null> => {
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
  assertInstanceSystemWritePath(INSTANCE_DIRECTORY, "initialize instance profile directory");
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
  private activeChatId: string | null = null;

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

  private toConversationTitle(timestamp: number): string {
    return new Date(timestamp).toISOString();
  }

  private listInstanceConversations(limit = 100): GuiConversationView[] {
    const normalizedLimit = Math.max(1, Math.trunc(limit));
    const activeInstanceId = this.activeInstance?.localInstanceId;

    return this.runtime.stateStore
      .listConversations(normalizedLimit * 2)
      .filter((conversation) => !activeInstanceId || conversation.sessionId === activeInstanceId)
      .slice(0, normalizedLimit)
      .map((conversation) => ({
        id: conversation.id,
        title: this.toConversationTitle(conversation.createdAt),
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      }));
  }

  private resolveDefaultChatId(): string {
    if (this.activeChatId) {
      return this.activeChatId;
    }

    const recentConversation = this.listInstanceConversations(1)[0];
    if (recentConversation) {
      this.activeChatId = recentConversation.id;
      return this.activeChatId;
    }

    if (this.activeInstance) {
      this.activeChatId = `instance-${this.activeInstance.localInstanceId}-${crypto.randomUUID()}`;
      return this.activeChatId;
    }
    this.activeChatId = `chat-${crypto.randomUUID()}`;
    return this.activeChatId;
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
    const jobs = this.runtime.stateStore
      .listJobs()
      .toSorted((a, b) => b.updatedAt - a.updatedAt)
      .map(mapJobToView)
      .filter((job) => GUI_QUEUE_INCLUDE_HISTORY || ACTIVE_JOB_STATUSES.has(job.status));
    return { jobs };
  }

  getActivity(limit = 100): GuiActivityResponse {
    const normalizedLimit = Math.max(1, Math.trunc(limit));
    return {
      entries: this.activity.slice(0, normalizedLimit),
    };
  }

  getConversations(limit = 100): GuiConversationsResponse {
    return {
      conversations: this.listInstanceConversations(limit),
    };
  }

  getConversationMessages(conversationId: string, limit = 500): GuiConversationMessagesResponse {
    const normalizedConversationId = conversationId.trim();
    if (!normalizedConversationId) {
      throw new Error("Conversation id is required");
    }

    const conversation = this.runtime.stateStore.getConversation(normalizedConversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${normalizedConversationId}`);
    }

    const activeInstanceId = this.activeInstance?.localInstanceId;
    if (activeInstanceId && conversation.sessionId !== activeInstanceId) {
      throw new Error("Conversation is not accessible for the current instance");
    }

    const normalizedLimit = Math.max(1, Math.trunc(limit));
    const messages = this.runtime.stateStore
      .listChatMessages(normalizedConversationId, normalizedLimit)
      .map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      }));

    return {
      conversationId: normalizedConversationId,
      messages,
    };
  }

  async listInstances(): Promise<GuiInstancesResponse> {
    const instances = (await readInstanceFiles()).map((entry) => toInstanceView(entry.fileName, entry.document));
    return { instances };
  }

  async createInstance(payload: GuiCreateInstanceRequest): Promise<GuiCreateInstanceResponse> {
    assertInstanceSystemWritePath(INSTANCE_DIRECTORY, "initialize instance profile directory");
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

    const nextInstanceFilePath = path.join(INSTANCE_DIRECTORY, fileName);
    assertInstanceSystemWritePath(nextInstanceFilePath, "write instance profile");
    await writeFile(nextInstanceFilePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    const instance = toInstanceView(fileName, document);
    this.activeInstance = instance;
    this.activeChatId = null;
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
    this.activeChatId = null;
    process.env.TRENCHCLAW_OPERATOR_ALIAS = instance.name;
    process.env.TRENCHCLAW_PROFILE = instance.safetyProfile;
    this.addActivity("runtime", `Instance signed in: ${instance.name} (${instance.localInstanceId})`);
    return { instance };
  }

  async getVault(): Promise<GuiVaultResponse> {
    assertProtectedNoReadWritePath(NO_READ_DIRECTORY, "initialize vault directory");
    await mkdir(NO_READ_DIRECTORY, { recursive: true, mode: 0o700 });
    const created = await ensureVaultFileExists({
      vaultPath: VAULT_FILE_PATH,
      templatePath: VAULT_TEMPLATE_FILE_PATH,
    });
    assertProtectedNoReadWritePath(VAULT_FILE_PATH, "read vault file");
    const content = await readFile(VAULT_FILE_PATH, "utf8");
    parseVaultJsonText(content);
    return {
      filePath: VAULT_FILE_PATH,
      templatePath: VAULT_TEMPLATE_FILE_PATH,
      initializedFromTemplate: created.initializedFromTemplate,
      content,
    };
  }

  async updateVault(payload: GuiUpdateVaultRequest): Promise<GuiUpdateVaultResponse> {
    assertProtectedNoReadWritePath(NO_READ_DIRECTORY, "initialize vault directory");
    await mkdir(NO_READ_DIRECTORY, { recursive: true, mode: 0o700 });
    await ensureVaultFileExists({
      vaultPath: VAULT_FILE_PATH,
      templatePath: VAULT_TEMPLATE_FILE_PATH,
    });
    const parsed = parseVaultJsonText(payload.content);
    const serialized = `${JSON.stringify(parsed, null, 2)}\n`;
    assertProtectedNoReadWritePath(VAULT_FILE_PATH, "write vault file");
    await writeFile(VAULT_FILE_PATH, serialized, { encoding: "utf8", mode: 0o600 });
    this.addActivity("runtime", "Vault updated");
    return {
      filePath: VAULT_FILE_PATH,
      savedAt: new Date().toISOString(),
    };
  }

  async streamChat(messages: UIMessage[], input?: { chatId?: string; conversationTitle?: string }): Promise<Response> {
    const chatId = input?.chatId?.trim() || this.resolveDefaultChatId();
    this.activeChatId = chatId;
    this.addActivity("chat", `Streaming prompt received (${messages.length} message${messages.length === 1 ? "" : "s"})`);
    return this.runtime.chat.stream(messages, {
      headers: CORS_HEADERS,
      chatId,
      sessionId: this.activeInstance?.localInstanceId,
      conversationTitle: input?.conversationTitle,
    });
  }

  async runDispatcherQueueTest(input: DispatcherTestRequest): Promise<{
    jobId: string;
    completed: boolean;
    status: string;
    result: unknown;
  }> {
    const job = this.runtime.enqueueJob({
      botId: "gui-dispatch-test",
      routineName: "actionSequence",
      config: {
        intervalMs: 60_000,
        steps: [
          {
            key: "ping",
            actionName: "pingRuntime",
            input: {
              message: input.message,
            },
          },
        ],
      },
    });
    this.addActivity("queue", `Dispatcher test enqueued (${job.id})`);

    const finalJob = await this.waitForJobResult(job.id, input.waitMs);
    return {
      jobId: job.id,
      completed: finalJob?.lastResult !== undefined,
      status: finalJob?.status ?? "unknown",
      result: finalJob?.lastResult?.data ?? null,
    };
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
          return await this.streamChat(payload.messages, {
            chatId: payload.chatId,
            conversationTitle: payload.conversationTitle,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return Response.json({ error: errorMessage }, { status: 500, headers: CORS_HEADERS });
        }
      }

      if (request.method === "POST" && url.pathname === "/api/gui/tests/dispatcher") {
        const payload = await parseDispatcherTestRequest(request);
        if (!payload) {
          return Response.json({ error: "Invalid dispatcher test payload" }, { status: 400, headers: CORS_HEADERS });
        }

        try {
          return Response.json(await this.runDispatcherQueueTest(payload), { headers: CORS_HEADERS });
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

      if (request.method === "GET" && url.pathname === "/api/gui/conversations") {
        const limitParam = Number(url.searchParams.get("limit") ?? 100);
        const limit = Number.isFinite(limitParam) ? limitParam : 100;
        return Response.json(this.getConversations(limit), { headers: CORS_HEADERS });
      }

      if (request.method === "GET" && url.pathname.startsWith("/api/gui/conversations/") && url.pathname.endsWith("/messages")) {
        const prefix = "/api/gui/conversations/";
        const suffix = "/messages";
        const encodedConversationId = url.pathname.slice(prefix.length, -suffix.length);
        const conversationId = decodeURIComponent(encodedConversationId);
        const limitParam = Number(url.searchParams.get("limit") ?? 500);
        const limit = Number.isFinite(limitParam) ? limitParam : 500;

        try {
          return Response.json(this.getConversationMessages(conversationId, limit), { headers: CORS_HEADERS });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return Response.json({ error: errorMessage }, { status: 404, headers: CORS_HEADERS });
        }
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

      if (request.method === "GET" && url.pathname === "/api/gui/vault") {
        try {
          return Response.json(await this.getVault(), { headers: CORS_HEADERS });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return Response.json({ error: errorMessage }, { status: 500, headers: CORS_HEADERS });
        }
      }

      if (request.method === "PUT" && url.pathname === "/api/gui/vault") {
        const payload = await parseUpdateVaultRequest(request);
        if (!payload) {
          return Response.json({ error: "Invalid vault payload" }, { status: 400, headers: CORS_HEADERS });
        }

        try {
          return Response.json(await this.updateVault(payload), { headers: CORS_HEADERS });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return Response.json({ error: errorMessage }, { status: 400, headers: CORS_HEADERS });
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

  private async waitForJobResult(jobId: string, waitMs: number): Promise<ReturnType<RuntimeBootstrap["stateStore"]["getJob"]>> {
    const timeoutAt = Date.now() + waitMs;
    let job = this.runtime.stateStore.getJob(jobId);
    while (Date.now() < timeoutAt) {
      if (job?.lastResult) {
        return job;
      }
      await Bun.sleep(100);
      job = this.runtime.stateStore.getJob(jobId);
    }
    return job;
  }
}

export const createWebGuiApiHandler = (runtime: RuntimeBootstrap): ((request: Request) => Promise<Response>) => {
  const transport = new RuntimeGuiTransport(runtime);
  return transport.createApiHandler();
};
