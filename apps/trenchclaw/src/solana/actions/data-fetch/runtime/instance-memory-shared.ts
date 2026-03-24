import type { InstanceFactState, InstanceMemoryBundle, InstanceProfileState } from "../../../../ai/contracts/types/state";

const normalizeFactKeySegment = (segment: string): string =>
  segment
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");

export const resolveInstanceId = (inputInstanceId: string | undefined): string | null => {
  const explicit = inputInstanceId?.trim();
  if (explicit) {
    return explicit;
  }
  const fromEnv = process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : null;
};

export const normalizeFactKey = (input: string): string | null => {
  const normalized = input
    .trim()
    .replace(/[.\\]+/g, "/")
    .split("/")
    .map((segment) => normalizeFactKeySegment(segment))
    .filter((segment) => segment.length > 0)
    .join("/");
  return normalized.length > 0 ? normalized : null;
};

export const buildFactMap = (facts: InstanceFactState[]): Record<string, unknown> =>
  Object.fromEntries(facts.map((fact) => [fact.factKey, fact.factValue]));

export const buildInstanceMemoryBundle = (input: {
  instanceId: string;
  profile: InstanceProfileState | null;
  facts: InstanceFactState[];
}): InstanceMemoryBundle => ({
  instanceId: input.instanceId,
  profile: input.profile,
  facts: input.facts,
  factMap: buildFactMap(input.facts),
  fetchedAt: Date.now(),
});
