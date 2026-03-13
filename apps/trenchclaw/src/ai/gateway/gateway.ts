import { loadDefaultSystemPrompt } from "../llm/prompt-loader";
import { buildOperatorChatPrompt } from "./operator-prompt";
import { buildGatewayLaneStatuses, getGatewayLanePolicy, getGatewayToolNamesForLane } from "./lane-policy";
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
  const laneStatuses = buildGatewayLaneStatuses({
    provider: context.resolvedModel.provider,
    model: context.resolvedModel.model,
    modelAvailable: context.resolvedModel.languageModel !== null,
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

    const resolvedModel = context.resolvedModel;

    if (!resolvedModel.languageModel) {
      const disabledMessage = resolvedModel.provider && resolvedModel.model
        ? `Selected AI model "${resolvedModel.model}" is not approved for operator chat. Choose a stronger model in AI settings.`
        : "LLM is not configured. Set provider credentials to enable live chat responses.";
      return {
        kind: "direct",
        lane,
        response: {
          message: disabledMessage,
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
