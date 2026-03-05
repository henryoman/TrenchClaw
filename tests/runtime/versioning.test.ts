import { describe, expect, test } from "bun:test";

import {
  formatVersion,
  incrementVersion,
  parseVersion,
} from "../../scripts/versioning";

describe("versioning", () => {
  test("parses stable and beta versions", () => {
    expect(parseVersion("0.0.1")).toEqual({
      major: 0,
      minor: 0,
      patch: 1,
      beta: null,
    });
    expect(parseVersion("v0.0.1-beta.3")).toEqual({
      major: 0,
      minor: 0,
      patch: 1,
      beta: 3,
    });
  });

  test("rejects invalid beta number", () => {
    expect(() => parseVersion("0.0.1-beta.0")).toThrow();
  });

  test("auto increments patch for stable version", () => {
    expect(incrementVersion("0.0.1", "auto")).toBe("0.0.2");
  });

  test("auto increments beta counter for beta version", () => {
    expect(incrementVersion("0.0.1-beta.1", "auto")).toBe("0.0.1-beta.2");
  });

  test("beta strategy starts a beta cycle from stable version", () => {
    expect(incrementVersion("0.0.1", "beta")).toBe("0.0.2-beta.1");
  });

  test("beta strategy increments existing beta number", () => {
    expect(incrementVersion("0.0.2-beta.2", "beta")).toBe("0.0.2-beta.3");
  });

  test("patch strategy finalizes beta versions to stable", () => {
    expect(incrementVersion("0.0.2-beta.3", "patch")).toBe("0.0.2");
  });

  test("patch strategy increments stable patch number", () => {
    expect(incrementVersion("0.0.2", "patch")).toBe("0.0.3");
  });

  test("formats parsed versions consistently", () => {
    expect(
      formatVersion({
        major: 0,
        minor: 0,
        patch: 1,
        beta: 4,
      }),
    ).toBe("0.0.1-beta.4");
  });
});
