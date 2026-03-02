import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { RuntimeEvent, RuntimeEventMap, RuntimeEventName } from "../../ai/runtime/types/events";
import { assertRuntimeSystemWritePath } from "../security/write-scope";
import { getLogIoWorkerClient } from "./log-io-worker";

export interface RuntimeFileEventLogConfig {
  directory: string;
}

const APP_ROOT_DIRECTORY = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

const toAbsolutePath = (targetPath: string): string =>
  path.isAbsolute(targetPath) ? targetPath : path.join(APP_ROOT_DIRECTORY, targetPath);

export class RuntimeFileEventLog {
  private readonly directory: string;
  private readonly writer = getLogIoWorkerClient();

  constructor(config: RuntimeFileEventLogConfig) {
    this.directory = toAbsolutePath(config.directory);
    assertRuntimeSystemWritePath(this.directory, "initialize runtime event log directory");
    mkdirSync(this.directory, { recursive: true });
  }

  write<K extends RuntimeEventName>(type: K, payload: RuntimeEventMap[K], timestamp = Date.now()): void {
    const event: RuntimeEvent<K> = {
      type,
      timestamp,
      payload,
    };

    const filename = `${new Date(timestamp).toISOString().slice(0, 10)}.jsonl`;
    const filePath = path.join(this.directory, filename);
    assertRuntimeSystemWritePath(filePath, "write runtime event log");
    void this.writer.appendUtf8(filePath, `${JSON.stringify(event)}\n`);
  }
}
