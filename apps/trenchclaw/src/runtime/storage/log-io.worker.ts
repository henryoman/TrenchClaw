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
};

const postResponse = (response: LogIoResponse): void => {
  (postMessage as (message: LogIoResponse) => void)(response);
};

self.onmessage = async (event: MessageEvent<LogIoRequest>) => {
  const request = event.data;
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
    });
  } catch (error) {
    postResponse({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

