import { z } from "zod";

import { resolveInstanceWakeupSettingsPath } from "../instance-paths";
import { loadInstanceSettingsDocument, writeInstanceSettingsDocument } from "./instance-settings-io";

export const DEFAULT_WAKEUP_PROMPT = [
  "IF there are pending runtime jobs or wake-up issues that need operator attention, summarize the situation clearly.",
  "IF a job looks unsafe to resume, explain why it should stay paused.",
  "IF startup health checks fail, report the blocking reason.",
  "IF nothing needs attention, do nothing.",
].join("\n");

const createDefaultWakeupSettings = () => ({
  intervalMinutes: 30,
  prompt: DEFAULT_WAKEUP_PROMPT,
});

const createDefaultInstanceWakeupSettings = () => ({
  configVersion: 1 as const,
  wakeup: createDefaultWakeupSettings(),
});

export const wakeupSettingsSchema = z.object({
  intervalMinutes: z.number().int().min(0).max(24 * 60).default(30),
  prompt: z.string().max(12_000).default(DEFAULT_WAKEUP_PROMPT),
}).default(createDefaultWakeupSettings);

export const instanceWakeupSettingsSchema = z.object({
  configVersion: z.literal(1).default(1),
  wakeup: wakeupSettingsSchema,
}).default(createDefaultInstanceWakeupSettings);

export type WakeupSettings = z.output<typeof wakeupSettingsSchema>;
export type InstanceWakeupSettingsDocument = z.output<typeof instanceWakeupSettingsSchema>;
export type InstanceWakeupSettingsInput = z.input<typeof instanceWakeupSettingsSchema>;

export interface InstanceWakeupSettingsPayload {
  instanceId: string | null;
  filePath: string | null;
  exists: boolean;
  rawSettings: unknown;
  resolvedSettings: unknown;
}

export const DEFAULT_WAKEUP_SETTINGS: WakeupSettings = wakeupSettingsSchema.parse({});

export const loadInstanceWakeupSettings = async (input?: {
  instanceId?: string | null;
}): Promise<InstanceWakeupSettingsPayload> => {
  return loadInstanceSettingsDocument({
    instanceId: input?.instanceId,
    resolvePath: resolveInstanceWakeupSettingsPath,
    parseDocument: (rawSettings) => instanceWakeupSettingsSchema.parse(rawSettings),
  });
};

export const writeInstanceWakeupSettings = async (
  instanceId: string,
  document: InstanceWakeupSettingsInput,
): Promise<string> => {
  return writeInstanceSettingsDocument({
    instanceId,
    document,
    resolvePath: resolveInstanceWakeupSettingsPath,
    parseDocument: (nextDocument) => instanceWakeupSettingsSchema.parse(nextDocument),
    operation: "write instance wakeup settings",
  });
};
