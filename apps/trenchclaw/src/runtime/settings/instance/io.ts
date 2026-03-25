import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseStructuredFile } from "../../../ai/llm/shared";
import { resolveCurrentActiveInstanceIdSync } from "../../instance/state";
import { assertInstanceSystemWritePath } from "../../security/writeScope";

export interface InstanceSettingsDocumentPayload {
  instanceId: string | null;
  filePath: string | null;
  exists: boolean;
  rawSettings: unknown;
  resolvedSettings: unknown;
}

const writeFileWithMode = async (targetPath: string, content: string, mode = 0o600): Promise<void> => {
  await writeFile(targetPath, content, { encoding: "utf8", mode });
  try {
    await chmod(targetPath, mode);
  } catch {
    // Best-effort only for filesystems without POSIX permission support.
  }
};

export const serializeJsonDocument = (document: unknown): string => `${JSON.stringify(document, null, 2)}\n`;

export const writeJsonDocument = async <TDocument>(input: {
  filePath: string;
  document: TDocument;
  serializeDocument?: (document: TDocument) => unknown;
  assertWritePath?: (targetPath: string) => void;
}): Promise<string> => {
  const targetPath = path.resolve(input.filePath);
  input.assertWritePath?.(targetPath);
  await mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
  const content = serializeJsonDocument(input.serializeDocument ? input.serializeDocument(input.document) : input.document);
  await writeFileWithMode(targetPath, content);
  return targetPath;
};

export const ensureSeededJsonDocument = async <TResolved>(input: {
  filePath: string;
  seedPath: string;
  parseDocument: (rawSettings: unknown) => TResolved;
  serializeDocument?: (document: TResolved) => unknown;
  assertWritePath?: (targetPath: string) => void;
  missingSeedDescription: string;
}): Promise<{ created: boolean; filePath: string; document: TResolved }> => {
  const targetPath = path.resolve(input.filePath);
  try {
    const existing = await stat(targetPath);
    if (!existing.isFile()) {
      throw new Error(`Expected a file at "${targetPath}" but found a non-file entry.`);
    }
    const rawDocument = await parseStructuredFile(targetPath);
    return {
      created: false,
      filePath: targetPath,
      document: input.parseDocument(rawDocument),
    };
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  input.assertWritePath?.(targetPath);
  const resolvedSeedPath = path.resolve(input.seedPath);
  const rawSeed = await readFile(resolvedSeedPath, "utf8").catch((error) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(`${input.missingSeedDescription}: "${resolvedSeedPath}"`);
    }
    throw error;
  });
  const document = input.parseDocument(JSON.parse(rawSeed));
  const filePath = await writeJsonDocument({
    filePath: targetPath,
    document,
    serializeDocument: input.serializeDocument,
  });
  return {
    created: true,
    filePath,
    document,
  };
};

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
  return writeJsonDocument({
    filePath,
    document: input.document,
    serializeDocument: input.parseDocument,
    assertWritePath: (targetPath) => {
      assertInstanceSystemWritePath(targetPath, input.operation);
    },
  });
};
