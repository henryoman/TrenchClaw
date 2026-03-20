import { describe, expect, test } from "bun:test";

import {
  formatVersion,
  incrementVersion,
  parseVersion,
} from "../../scripts/versioning";

describe("versioning", () => {
  test("parses stable and beta versions", () => {
    expect(parseVersion("0.0.0")).toEqual({
      major: 0,
      minor: 0,
      patch: 0,
      beta: null,
    });
    expect(parseVersion("v0.0.0-beta.3")).toEqual({
      major: 0,
      minor: 0,
      patch: 0,
      beta: 3,
    });
  });

  test("rejects invalid beta number", () => {
    expect(() => parseVersion("0.0.0-beta.0")).toThrow();
  });

  test("beta strategy increments existing beta number", () => {
    expect(incrementVersion("0.0.0-beta.1", "beta")).toBe("0.0.0-beta.2");
  });

  test("beta strategy rejects stable versions", () => {
    expect(() => incrementVersion("0.0.0", "beta")).toThrow(
      'Cannot increment "beta" from stable version "0.0.0". Start from an existing prerelease version first.',
    );
  });

  test("patch strategy promotes a prerelease to its stable version", () => {
    expect(incrementVersion("0.0.0-beta.4", "patch")).toBe("0.0.0");
  });

  test("patch strategy increments stable versions", () => {
    expect(incrementVersion("0.0.0", "patch")).toBe("0.0.1");
  });

  test("minor strategy increments stable versions", () => {
    expect(incrementVersion("0.0.0", "minor")).toBe("0.1.0");
  });

  test("minor strategy rejects prerelease versions", () => {
    expect(() => incrementVersion("0.0.0-beta.4", "minor")).toThrow(
      'Cannot auto-increment "minor" from prerelease version "0.0.0-beta.4".',
    );
  });

  test("formats parsed versions consistently", () => {
    expect(
      formatVersion({
        major: 0,
        minor: 0,
        patch: 0,
        beta: 4,
      }),
    ).toBe("0.0.0-beta.4");
    expect(
      formatVersion({
        major: 0,
        minor: 0,
        patch: 0,
        beta: null,
      }),
    ).toBe("0.0.0");
  });
});
