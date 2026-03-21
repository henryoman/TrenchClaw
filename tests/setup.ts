import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll } from "bun:test";

const TEST_RUNTIME_ROOT = mkdtempSync(path.join(os.tmpdir(), "trenchclaw-test-runtime-"));

process.env.TRENCHCLAW_RUNTIME_STATE_ROOT = TEST_RUNTIME_ROOT;
process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = "01";

beforeAll(() => {
  console.log("[tests] starting TrenchClaw test suite");
});

afterAll(() => {
  console.log("[tests] finished TrenchClaw test suite");
  rmSync(TEST_RUNTIME_ROOT, { recursive: true, force: true });
});
