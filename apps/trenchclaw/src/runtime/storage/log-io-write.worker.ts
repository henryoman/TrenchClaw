import {
  getLogIoErrorMessage,
  type LogIoRequest,
  type LogIoResponse,
  performLogIoWrite,
} from "./log-io-core";

const postResponse = (response: LogIoResponse): void => {
  (postMessage as (message: LogIoResponse) => void)(response);
};

self.addEventListener("message", async (event: MessageEvent<LogIoRequest>) => {
  const request = event.data;
  try {
    const result = await performLogIoWrite(request);
    postResponse({
      id: request.id,
      ok: true,
      operation: result.operation,
      filePath: result.filePath,
      bytes: result.bytes,
    });
  } catch (error) {
    const bytes = Buffer.byteLength(request.content, "utf8");
    postResponse({
      id: request.id,
      ok: false,
      error: getLogIoErrorMessage(error),
      operation: request.type,
      filePath: request.filePath,
      bytes,
    });
  }
});
