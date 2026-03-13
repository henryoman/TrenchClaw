import type { LanguageModel } from "ai";

import { createLanguageModel, resolveLlmProviderConfig } from "../llm/config";
import type { GatewayLaneStatus } from "./types";

export const resolveGatewayLanguageModel = async (
  fallbackProvider: string | null,
  fallbackModel: string | null,
): Promise<{
  provider: string | null;
  model: string | null;
  languageModel: LanguageModel | null;
}> => {
  const config = await resolveLlmProviderConfig();
  if (!config) {
    return {
      provider: fallbackProvider,
      model: fallbackModel,
      languageModel: null,
    };
  }

  return {
    provider: config.provider,
    model: config.model,
    languageModel: createLanguageModel(config),
  };
};

export const buildGatewayLaneStatuses = (input: {
  provider: string | null;
  model: string | null;
  endpointsValid: boolean;
}): GatewayLaneStatus[] => {
  const baseStatus =
    input.provider && input.model
      ? {
          enabled: true,
          provider: input.provider,
          model: input.model,
        }
      : {
          enabled: false,
          provider: input.provider,
          model: input.model,
          reason: "No model provider configured",
        };

  return [
    {
      lane: "operator-chat",
      ...baseStatus,
      ...(input.endpointsValid ? {} : { enabled: false, reason: "Runtime endpoints are invalid" }),
    },
    {
      lane: "workspace-agent",
      ...baseStatus,
    },
    {
      lane: "background-summary",
      ...baseStatus,
    },
  ];
};
