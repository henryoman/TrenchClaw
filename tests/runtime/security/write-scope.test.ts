import { describe, expect, test } from "bun:test";

import {
  assertInstanceSystemWritePath,
  assertRuntimeSystemWritePath,
  WriteScopeViolationError,
} from "../../../apps/trenchclaw/src/runtime/security/write-scope";
import { coreAppPath } from "../../helpers/core-paths";

describe("write-scope policy", () => {
  test("allows runtime system writes under db root", () => {
    const allowedPath = coreAppPath("src/ai/brain/db/system/2026-02-27.log");
    expect(() => assertRuntimeSystemWritePath(allowedPath, "append system log entry")).not.toThrow();
  });

  test("blocks runtime system writes outside db root", () => {
    const blockedPath = coreAppPath("src/ai/brain/protected/notes/system.txt");
    expect(() => assertRuntimeSystemWritePath(blockedPath, "write notes file")).toThrow(WriteScopeViolationError);
  });

  test("allows instance system writes under protected instance root", () => {
    const allowedPath = coreAppPath("src/ai/brain/protected/instance/i-01.json");
    expect(() => assertInstanceSystemWritePath(allowedPath, "write instance profile")).not.toThrow();
  });
});
