import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type AppendUtf8Request = {
  id: string;
  type: "appendUtf8";
  filePath: string;
  content: string;
};

type WriteUtf8Request = {
  id: string;
  type: "writeUtf8";
  filePath: string;
  content: string;
};

type LogIoRequest = AppendUtf8Request | WriteUtf8Request;

type LogIoResponse = {
  id: string;
  ok: boolean;
  error?: string;
  operation?: "appendUtf8" | "writeUtf8";
  filePath?: string;
  bytes?: number;
};

const postResponse = (response: LogIoResponse): void => {
  (postMessage as (message: LogIoResponse) => void)(response);
};

self.addEventListener("message", async (event: MessageEvent<LogIoRequest>) => {
  const request = event.data;
  const bytes = Buffer.byteLength(request.content, "utf8");
  try {
    await mkdir(path.dirname(request.filePath), { recursive: true });
    if (request.type === "appendUtf8") {
      await appendFile(request.filePath, request.content, "utf8");
    } else {
      await writeFile(request.filePath, request.content, "utf8");
    }
    postResponse({
      id: request.id,
      ok: true,
      operation: request.type,
      filePath: request.filePath,
      bytes,
    });
  } catch (error) {
    postResponse({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      operation: request.type,
      filePath: request.filePath,
      bytes,
    });
  }
});
