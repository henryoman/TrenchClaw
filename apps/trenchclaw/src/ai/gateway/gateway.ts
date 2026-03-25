import { loadDefaultSystemPrompt } from "../llm/promptLoader";
import { buildOperatorChatPrompt } from "./operatorPrompt";
import { buildGatewayLaneStatuses, getGatewayLanePolicy, getGatewayToolNamesForLane } from "./lanePolicy";
import type {
  GatewayContext,
  GatewayPreparedExecution,
  GatewayPreparedModelExecution,
  GatewayRequest,
  RuntimeGateway,
} from "./types";

export const createRuntimeGateway = (
  context: GatewayContext,
): RuntimeGateway => {
  const toolSnapshot = context.toolSnapshot ?? context.capabilitySnapshot;
  const laneStatuses = buildGatewayLaneStatuses({
    provider: context.resolvedModel.provider,
    model: context.resolvedModel.model,
    endpointsValid: true,
  });

  const listToolNames = (lane: GatewayRequest["lane"] = "operator-chat"): string[] => {
    const selectedLane = lane ?? "operator-chat";
    if (!toolSnapshot) {
      return context.registry
        .list()
        .filter((entry) => Boolean(context.registry.get(entry.name)?.inputSchema))
        .map((entry) => entry.name)
        .toSorted((left, right) => left.localeCompare(right));
    }
    return getGatewayToolNamesForLane(toolSnapshot, selectedLane).toSorted((left, right) => left.localeCompare(right));
  };

  const prepareChatExecution = async (request: GatewayRequest): Promise<GatewayPreparedExecution> => {
    const lane = request.lane ?? "operator-chat";
    const lanePolicy = getGatewayLanePolicy(lane);

    const toolNames = toolSnapshot
      ? getGatewayToolNamesForLane(toolSnapshot, lane, request.userMessage)
      : listToolNames(lane);
    const systemPrompt = lanePolicy.promptKind === "operator"
      ? await buildOperatorChatPrompt({
        settings: context.settings,
        toolSnapshot,
        toolNames,
        stateStore: context.stateStore,
      })
      : lanePolicy.promptKind === "workspace"
        ? await loadDefaultSystemPrompt()
        : [
          "You are TrenchClaw's background summary lane.",
          "Summarize completed work briefly and factually.",
        ].join("\n\n");

    const resolvedModel = context.resolvedModel;

    if (!resolvedModel.languageModel) {
      return {
        kind: "direct",
        lane,
        response: {
          message: "LLM is not configured. Check AI settings and provider credentials to enable live chat responses.",
          toolCalls: [],
          lane,
          provider: resolvedModel.provider,
          model: resolvedModel.model,
          executionTrace: {
            lane,
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
