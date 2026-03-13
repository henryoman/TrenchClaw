import type { UIMessage } from "ai";

import { loadDefaultSystemPrompt } from "../llm/prompt-loader";
import { buildOperatorChatPrompt } from "./operator-prompt";
import { maybeExecuteFastPath } from "./fast-paths";
import { getGatewayLanePolicy, getGatewayToolNamesForLane } from "./lane-policy";
import { buildGatewayLaneStatuses, resolveGatewayLanguageModel } from "./provider-registry";
import type {
  GatewayContext,
  GatewayPreparedDirectExecution,
  GatewayPreparedExecution,
  GatewayPreparedModelExecution,
  GatewayRequest,
  RuntimeGateway,
} from "./types";

const trimOrUndefined = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

const extractLatestUserText = (messages: UIMessage[]): string =>
  messages
    .toReversed()
    .find((message) => message.role === "user")
    ?.parts.map((part) => (part.type === "text" ? part.text : "")).join("\n")
    .trim() ?? "";

export interface RuntimeGatewayOverrides {
  resolveStreamingModel?: () => Promise<import("ai").LanguageModel> | import("ai").LanguageModel;
}

export const createRuntimeGateway = (
  context: GatewayContext,
  overrides: RuntimeGatewayOverrides = {},
): RuntimeGateway => {
  const laneStatuses = buildGatewayLaneStatuses({
    provider: context.llm?.provider ?? null,
    model: context.llm?.model ?? null,
    endpointsValid: true,
  });

  const listToolNames = (lane: GatewayRequest["lane"] = "operator-chat"): string[] => {
    const selectedLane = lane ?? "operator-chat";
    if (!context.capabilitySnapshot) {
      return context.registry
        .list()
        .filter((entry) => Boolean(context.registry.get(entry.name)?.inputSchema))
        .map((entry) => entry.name)
        .toSorted((left, right) => left.localeCompare(right));
    }
    return getGatewayToolNamesForLane(context.capabilitySnapshot, selectedLane).toSorted((left, right) => left.localeCompare(right));
  };

  const prepareChatExecution = async (request: GatewayRequest): Promise<GatewayPreparedExecution> => {
    const lane = request.lane ?? "operator-chat";
    const lanePolicy = getGatewayLanePolicy(lane);
    const userMessage = trimOrUndefined(request.userMessage) ?? extractLatestUserText(request.messages);

    if (lanePolicy.allowFastPath && request.allowFastPath !== false) {
      const fastPath = await maybeExecuteFastPath({
        requestMessages: request.messages,
        context,
        lane,
        userMessage,
      });
      if (fastPath) {
        return {
          kind: "direct",
          lane,
          response: fastPath,
        } satisfies GatewayPreparedDirectExecution;
      }
    }

    const toolNames = listToolNames(lane);
    const systemPrompt = lanePolicy.promptKind === "operator"
      ? await buildOperatorChatPrompt({
        settings: context.settings,
        capabilitySnapshot: context.capabilitySnapshot,
        toolNames,
      })
      : lanePolicy.promptKind === "workspace"
        ? await loadDefaultSystemPrompt()
        : [
          "You are TrenchClaw's background summary lane.",
          "Summarize completed work briefly and factually.",
        ].join("\n\n");

    const resolvedModel = overrides.resolveStreamingModel
      ? {
          provider: context.llm?.provider ?? null,
          model: context.llm?.model ?? null,
          languageModel: await overrides.resolveStreamingModel(),
        }
      : await resolveGatewayLanguageModel(context.llm?.provider ?? null, context.llm?.model ?? null);

    if (!resolvedModel.languageModel) {
      return {
        kind: "direct",
        lane,
        response: {
          message: "LLM is not configured. Set provider credentials to enable live chat responses.",
          toolCalls: [],
          fastPathUsed: false,
          lane,
          provider: resolvedModel.provider,
          model: resolvedModel.model,
          executionTrace: {
            lane,
            fastPath: null,
            provider: resolvedModel.provider,
            model: resolvedModel.model,
            promptChars: systemPrompt.length,
            toolCount: toolNames.length,
            toolSteps: 0,
            durationMs: 0,
            failureCode: "LLM_DISABLED",
          },
        },
      };
    }

    return {
      kind: "llm",
      lane,
      provider: resolvedModel.provider,
      modelId: resolvedModel.model,
      model: resolvedModel.languageModel,
      systemPrompt,
      toolNames,
      maxOutputTokens: lanePolicy.maxOutputTokens,
      temperature: lanePolicy.temperature,
      maxToolSteps: lanePolicy.maxToolSteps,
      executionTrace: {
        lane,
        fastPath: null,
        provider: resolvedModel.provider,
        model: resolvedModel.model,
        promptChars: systemPrompt.length,
        toolCount: toolNames.length,
        toolSteps: 0,
        durationMs: 0,
      },
    } satisfies GatewayPreparedModelExecution;
  };

  return {
    prepareChatExecution,
    listToolNames,
    describe: () => ({
      lanes: laneStatuses,
    }),
  };
};
