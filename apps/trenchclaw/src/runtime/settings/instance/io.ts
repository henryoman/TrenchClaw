import { mkdir } from "node:fs/promises";
import path from "node:path";

import { parseStructuredFile } from "../../../ai/llm/shared";
import { resolveCurrentActiveInstanceIdSync } from "../../instance/state";
import { assertInstanceSystemWritePath } from "../../security/write-scope";

export interface InstanceSettingsDocumentPayload {
  instanceId: string | null;
  filePath: string | null;
  exists: boolean;
  rawSettings: unknown;
  resolvedSettings: unknown;
}

export const loadInstanceSettingsDocument = async <TResolved>(input: {
  instanceId?: string | null;
  resolvePath: (instanceId: string) => string;
  parseDocument: (rawSettings: unknown) => TResolved;
}): Promise<InstanceSettingsDocumentPayload> => {
  const instanceId = input.instanceId ?? resolveCurrentActiveInstanceIdSync();
  if (!instanceId) {
    return {
      instanceId: null,
      filePath: null,
      exists: false,
      rawSettings: {},
      resolvedSettings: {},
    };
  }

  const filePath = input.resolvePath(instanceId);
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return {
      instanceId,
      filePath,
      exists: false,
      rawSettings: {},
      resolvedSettings: {},
    };
  }

  const rawSettings = await parseStructuredFile(filePath);
  return {
    instanceId,
    filePath,
    exists: true,
    rawSettings,
    resolvedSettings: input.parseDocument(rawSettings),
  };
};

export const writeInstanceSettingsDocument = async <TDocument>(input: {
  instanceId: string;
  document: TDocument;
  resolvePath: (instanceId: string) => string;
  parseDocument: (document: TDocument) => unknown;
  operation: string;
}): Promise<string> => {
  const filePath = input.resolvePath(input.instanceId);
  assertInstanceSystemWritePath(filePath, input.operation);
  await mkdir(path.dirname(filePath), { recursive: true });
  await Bun.write(filePath, `${JSON.stringify(input.parseDocument(input.document), null, 2)}\n`);
  return filePath;
};
