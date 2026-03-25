import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dir, "..", "..");

const readInstallBootstrap = async (relativePath: string): Promise<string> =>
  readFile(path.join(repoRoot, relativePath), "utf8");

describe("public install bootstraps", () => {
  test("macOS bootstrap invokes the canonical installer with bash and a deterministic install dir", async () => {
    const script = await readInstallBootstrap("website/static/install/macos-bootstrap.sh");
    expect(script).toContain('DEFAULT_INSTALL_DIR="$HOME/.local/bin"');
    expect(script).toContain('TRENCHCLAW_INSTALL_DIR="${TRENCHCLAW_INSTALL_DIR:-${TRENCHCLAW_BIN_DIR:-$DEFAULT_INSTALL_DIR}}"');
    expect(script).toContain('TRENCHCLAW_INSTALL_DIR="$TRENCHCLAW_INSTALL_DIR" bash "$installer_tmp"');
    expect(script).not.toContain('TRENCHCLAW_VERSION="$TRENCHCLAW_VERSION" sh "$installer_tmp"');
  });

  test("Linux bootstrap invokes the canonical installer with bash and a deterministic install dir", async () => {
    const script = await readInstallBootstrap("website/static/install/linux-bootstrap.sh");
    expect(script).toContain('DEFAULT_INSTALL_DIR="$HOME/.local/bin"');
    expect(script).toContain('TRENCHCLAW_INSTALL_DIR="${TRENCHCLAW_INSTALL_DIR:-${TRENCHCLAW_BIN_DIR:-$DEFAULT_INSTALL_DIR}}"');
    expect(script).toContain('TRENCHCLAW_INSTALL_DIR="$TRENCHCLAW_INSTALL_DIR" bash "$installer_tmp"');
    expect(script).not.toContain('TRENCHCLAW_VERSION="$TRENCHCLAW_VERSION" sh "$installer_tmp"');
  });
});
