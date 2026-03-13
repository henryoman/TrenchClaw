import { describe, expect, test } from "bun:test";

import {
  normalizeTarget,
  resolveHostPlatformTarget,
  shouldSmokeCompileTargetOnHost,
} from "../../scripts/lib/release-platform";

describe("release-platform", () => {
  test("normalizes bun compile targets", () => {
    expect(normalizeTarget("bun-darwin-arm64")).toBe("darwin-arm64");
    expect(normalizeTarget("linux-x64")).toBe("linux-x64");
  });

  test("resolves supported host platform targets", () => {
    expect(resolveHostPlatformTarget("darwin", "arm64")).toBe("darwin-arm64");
    expect(resolveHostPlatformTarget("linux", "x64")).toBe("linux-x64");
    expect(resolveHostPlatformTarget("win32", "x64")).toBeNull();
    expect(resolveHostPlatformTarget("darwin", "ia32")).toBeNull();
  });

  test("only smokes artifacts that match the current host", () => {
    expect(shouldSmokeCompileTargetOnHost("bun-darwin-arm64", "darwin", "arm64")).toBe(true);
    expect(shouldSmokeCompileTargetOnHost("bun-linux-x64", "darwin", "arm64")).toBe(false);
    expect(shouldSmokeCompileTargetOnHost("bun-linux-arm64", "linux", "arm64")).toBe(true);
  });
});
