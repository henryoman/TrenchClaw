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

  test("beta-only track rejects stable versions", () => {
    expect(() => incrementVersion("0.0.0", "beta")).toThrow(
      'Current version "0.0.0" must stay on the 0.0.0-beta.N track for now.',
    );
  });

  test("beta-only track rejects non-zero release lines", () => {
    expect(() => incrementVersion("0.0.1-beta.1", "beta")).toThrow(
      'Current version "0.0.1-beta.1" must stay on the 0.0.0-beta.N track for now.',
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
  });
});
