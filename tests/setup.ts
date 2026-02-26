import { afterAll, beforeAll } from "bun:test";

beforeAll(() => {
  console.log("[tests] starting TrenchClaw test suite");
});

afterAll(() => {
  console.log("[tests] finished TrenchClaw test suite");
});
