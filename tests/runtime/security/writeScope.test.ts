import { describe, expect, test } from "bun:test";

import {
  assertInstanceSystemWritePath,
  assertRuntimeSystemWritePath,
  WriteScopeViolationError,
} from "../../../apps/trenchclaw/src/runtime/security/writeScope";
import { coreAppPath, runtimeStatePath } from "../../helpers/corePaths";

describe("write-scope policy", () => {
  test("allows runtime system writes under instance root", () => {
    const allowedPath = runtimeStatePath("instances/01/logs/system/runtime.log");
    expect(() => assertRuntimeSystemWritePath(allowedPath, "append system log entry")).not.toThrow();
  });

  test("blocks runtime system writes outside generated or instance roots", () => {
    const blockedPath = coreAppPath("src/ai/brain/config/prompts/system.md");
    expect(() => assertRuntimeSystemWritePath(blockedPath, "write notes file")).toThrow(WriteScopeViolationError);
  });

  test("allows instance system writes under protected instance root", () => {
    const allowedPath = runtimeStatePath("instances/01/instance.json");
    expect(() => assertInstanceSystemWritePath(allowedPath, "write instance profile")).not.toThrow();
  });
});
