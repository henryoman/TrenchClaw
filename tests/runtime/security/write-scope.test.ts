import { describe, expect, test } from "bun:test";

import {
  assertInstanceSystemWritePath,
  assertRuntimeSystemWritePath,
  WriteScopeViolationError,
} from "../../../apps/trenchclaw/src/runtime/security/write-scope";
import { coreAppPath, generatedStatePath, runtimeStatePath } from "../../helpers/core-paths";

describe("write-scope policy", () => {
  test("allows runtime system writes under generated root", () => {
    const allowedPath = generatedStatePath("workspace-context.md");
    expect(() => assertRuntimeSystemWritePath(allowedPath, "append system log entry")).not.toThrow();
  });

  test("blocks runtime system writes outside generated or instance roots", () => {
    const blockedPath = coreAppPath("src/ai/config/system.md");
    expect(() => assertRuntimeSystemWritePath(blockedPath, "write notes file")).toThrow(WriteScopeViolationError);
  });

  test("allows instance system writes under protected instance root", () => {
    const allowedPath = runtimeStatePath("instances/01/instance.json");
    expect(() => assertInstanceSystemWritePath(allowedPath, "write instance profile")).not.toThrow();
  });
});
