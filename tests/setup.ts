import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll } from "bun:test";

const TEST_RUNTIME_ROOT = mkdtempSync(path.join(os.tmpdir(), "trenchclaw-test-runtime-"));
const TEST_GENERATED_ROOT = mkdtempSync(path.join(os.tmpdir(), "trenchclaw-test-generated-"));

process.env.TRENCHCLAW_RUNTIME_STATE_ROOT = TEST_RUNTIME_ROOT;
process.env.TRENCHCLAW_GENERATED_ROOT = TEST_GENERATED_ROOT;

beforeAll(() => {
  console.log("[tests] starting TrenchClaw test suite");
});

afterAll(() => {
  console.log("[tests] finished TrenchClaw test suite");
  rmSync(TEST_RUNTIME_ROOT, { recursive: true, force: true });
  rmSync(TEST_GENERATED_ROOT, { recursive: true, force: true });
});
