import { mkdirSync } from "node:fs";
import path from "node:path";

import type { RuntimeEvent, RuntimeEventMap, RuntimeEventName } from "../../ai/runtime/types/events";

export interface RuntimeFileEventLogConfig {
  directory: string;
}

const toAbsolutePath = (targetPath: string): string =>
  path.isAbsolute(targetPath) ? targetPath : path.join(process.cwd(), targetPath);

export class RuntimeFileEventLog {
  private readonly directory: string;

  constructor(config: RuntimeFileEventLogConfig) {
    this.directory = toAbsolutePath(config.directory);
    mkdirSync(this.directory, { recursive: true });
  }

  write<K extends RuntimeEventName>(type: K, payload: RuntimeEventMap[K], timestamp = Date.now()): void {
    const event: RuntimeEvent<K> = {
      type,
      timestamp,
      payload,
    };

    const safeType = String(type).replaceAll(":", "_");
    const filename = `${timestamp}-${safeType}-${crypto.randomUUID()}.json`;
    const filePath = path.join(this.directory, filename);
    void Bun.write(filePath, `${JSON.stringify(event)}\n`);
  }
}

