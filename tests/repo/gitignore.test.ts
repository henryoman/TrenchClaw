import { describe, expect, test } from "bun:test";

describe("repo gitignore", () => {
  test("ignores personal runtime instance directories and keeps only the example seed tracked", async () => {
    const gitignore = await Bun.file(".gitignore").text();

    expect(gitignore).toContain("apps/trenchclaw/.runtime/instances/*/");
    expect(gitignore).toContain("!apps/trenchclaw/.runtime/instances/00/");
    expect(gitignore).not.toContain("!apps/trenchclaw/.runtime/instances/01/");
  });
});
