import type { RuntimeBootstrap } from "../../runtime/bootstrap";
import type { JobState } from "../../ai/runtime/types/state";

interface WebGuiChatRequest {
  message?: unknown;
}

interface WebGuiJobView {
  id: string;
  botId: string;
  routineName: string;
  status: JobState["status"];
  createdAt: number;
  updatedAt: number;
  nextRunAt: number | null;
  cyclesCompleted: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

const mapJobToView = (job: JobState): WebGuiJobView => ({
  id: job.id,
  botId: job.botId,
  routineName: job.routineName,
  status: job.status,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
  nextRunAt: typeof job.nextRunAt === "number" ? job.nextRunAt : null,
  cyclesCompleted: job.cyclesCompleted,
});

const listQueueJobs = (runtime: RuntimeBootstrap): WebGuiJobView[] =>
  runtime.stateStore
    .listJobs()
    .toSorted((a, b) => b.updatedAt - a.updatedAt)
    .map(mapJobToView);

const parseChatMessage = async (request: Request): Promise<string | null> => {
  let payload: WebGuiChatRequest;
  try {
    const parsed: unknown = await request.json();
    if (!isRecord(parsed)) {
      return null;
    }
    payload = parsed;
  } catch {
    return null;
  }

  if (typeof payload.message !== "string") {
    return null;
  }

  const normalized = payload.message.trim();
  return normalized.length > 0 ? normalized : null;
};

export const createWebGuiApiHandler = (
  runtime: RuntimeBootstrap,
): ((request: Request) => Promise<Response> | Response) => {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/gui/bootstrap") {
      return Response.json({
        profile: runtime.settings.profile,
        llmEnabled: runtime.llm != null,
        runtime: runtime.describe(),
      });
    }

    if (request.method === "GET" && url.pathname === "/api/gui/queue") {
      return Response.json({
        jobs: listQueueJobs(runtime),
      });
    }

    if (request.method === "POST" && url.pathname === "/api/gui/chat") {
      const message = await parseChatMessage(request);
      if (!message) {
        return Response.json({ error: "Missing message" }, { status: 400 });
      }

      if (!runtime.llm) {
        return Response.json({
          reply: "LLM is not configured. Set provider credentials to enable live chat responses.",
          llmEnabled: false,
        });
      }

      try {
        const result = await runtime.llm.generate({
          prompt: message,
          maxOutputTokens: 900,
        });

        return Response.json({
          reply: result.text,
          llmEnabled: true,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return Response.json({ error: errorMessage }, { status: 500 });
      }
    }

    return new Response("Not Found", { status: 404 });
  };
};
