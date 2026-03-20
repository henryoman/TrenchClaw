import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type LogIoOperation = "appendUtf8" | "writeUtf8";

type LogIoRequestBase = {
  id: string;
  filePath: string;
  content: string;
};

export type AppendUtf8Request = LogIoRequestBase & {
  type: "appendUtf8";
};

export type WriteUtf8Request = LogIoRequestBase & {
  type: "writeUtf8";
};

export type LogIoRequest = AppendUtf8Request | WriteUtf8Request;

export type LogIoRequestWithoutId = Omit<LogIoRequest, "id">;

export type LogIoResponse = {
  id: string;
  ok: boolean;
  error?: string;
  operation?: LogIoOperation;
  filePath?: string;
  bytes?: number;
};

export type LogIoWriteResult = {
  operation: LogIoOperation;
  filePath: string;
  bytes: number;
};

export const performLogIoWrite = async (
  request: LogIoRequest | LogIoRequestWithoutId,
): Promise<LogIoWriteResult> => {
  await mkdir(path.dirname(request.filePath), { recursive: true });
  if (request.type === "appendUtf8") {
    await appendFile(request.filePath, request.content, "utf8");
  } else {
    await writeFile(request.filePath, request.content, "utf8");
  }

  return {
    operation: request.type,
    filePath: request.filePath,
    bytes: Buffer.byteLength(request.content, "utf8"),
  };
};

export const getLogIoErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
