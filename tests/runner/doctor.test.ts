import { afterEach, describe, expect, test } from "bun:test";
import path from "node:path";

import { collectDoctorReport, formatDoctorReport, resolveLayout, type ResolvedLayout } from "../../apps/runner/index";

const tempRoots: string[] = [];

const createTempRoot = async (): Promise<string> => {
  const root = path.join("/tmp", `trenchclaw-doctor-${crypto.randomUUID()}`);
  tempRoots.push(root);
  await Bun.$`mkdir -p ${root}`.quiet();
  return root;
};

const createLayout = async (): Promise<ResolvedLayout> => {
  const root = await createTempRoot();
  const guiDistDir = path.join(root, "gui");
  const guiIndexPath = path.join(guiDistDir, "index.html");
  await Bun.$`mkdir -p ${guiDistDir}`.quiet();
  await Bun.write(guiIndexPath, "<!doctype html><title>doctor</title>\n");
  return {
    kind: "release",
    root,
    guiDistDir,
    guiIndexPath,
    coreAssetRoot: path.join(root, "core"),
    runtimeStateRoot: path.join(root, ".trenchclaw"),
    generatedStateRoot: path.join(root, ".trenchclaw", "instances", "00", "cache", "generated"),
  };
};

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await Bun.$`rm -rf ${root}`.quiet();
  }
});

describe("collectDoctorReport", () => {
  test("uses the external developer runtime root instead of the repo-local fallback in workspace mode", () => {
    const homeRoot = path.join("/tmp", `trenchclaw-home-${crypto.randomUUID()}`);
    const layout = resolveLayout({
      ...process.env,
      HOME: homeRoot,
      USERPROFILE: homeRoot,
      TRENCHCLAW_RELEASE_ROOT: "",
      TRENCHCLAW_RUNTIME_STATE_ROOT: "",
    });

    expect(layout.kind).toBe("workspace");
    expect(layout.runtimeStateRoot).toBe(path.join(homeRoot, "trenchclaw-dev-runtime"));
    expect(layout.runtimeStateRoot).not.toBe(path.join(layout.root, "apps", "trenchclaw", ".runtime-state"));
  });

  test("treats missing optional CLIs as warnings instead of blocking first launch", async () => {
    const layout = await createLayout();
    const report = collectDoctorReport({
      layout,
      version: "test-version",
      which: () => null,
      env: {},
    });

    expect(report.summary.blocking).toBe(0);
    expect(report.checks.find((check) => check.id === "solana-cli")?.status).toBe("warn");
    expect(report.checks.find((check) => check.id === "helius-cli")?.status).toBe("warn");
    expect(report.featureReadiness.find((feature) => feature.id === "baseline-launch")?.status).toBe("ok");
    expect(report.featureReadiness.find((feature) => feature.id === "cli-shell-workflows")?.status).toBe("warn");
  });

  test("marks keyed workflows ready when vault data and CLIs are present", async () => {
    const layout = await createLayout();
    const instanceRoot = path.join(layout.runtimeStateRoot, "instances", "01");
    await Bun.$`mkdir -p ${instanceRoot}`.quiet();
    await Bun.write(
      path.join(layout.runtimeStateRoot, "instances", "active-instance.json"),
      `${JSON.stringify({ localInstanceId: "01" }, null, 2)}\n`,
    );
    await Bun.$`mkdir -p ${path.join(instanceRoot, "secrets")}`.quiet();
    await Bun.write(
      path.join(instanceRoot, "secrets", "vault.json"),
      `${JSON.stringify(
        {
          rpc: {
            default: {
              "provider-id": "helius",
              "http-url": "https://mainnet.helius-rpc.com/?api-key=test",
            },
          },
          llm: {
            openrouter: {
              "api-key": "openrouter-test",
            },
          },
          integrations: {
            jupiter: {
              "api-key": "jupiter-test",
            },
          },
        },
        null,
        2,
      )}\n`,
    );

    const report = collectDoctorReport({
      layout,
      version: "test-version",
      which: (command) => `/mock/bin/${command}`,
      env: {},
    });

    expect(report.checks.find((check) => check.id === "active-instance")?.status).toBe("ok");
    expect(report.checks.find((check) => check.id === "ai-key")?.status).toBe("ok");
    expect(report.checks.find((check) => check.id === "jupiter-key")?.status).toBe("ok");
    expect(report.checks.find((check) => check.id === "helius-config")?.status).toBe("ok");
    expect(report.featureReadiness.find((feature) => feature.id === "chat-workflows")?.status).toBe("ok");
    expect(report.featureReadiness.find((feature) => feature.id === "ultra-workflows")?.status).toBe("ok");
    expect(report.featureReadiness.find((feature) => feature.id === "cli-shell-workflows")?.status).toBe("ok");
    expect(formatDoctorReport(report)).toContain("TrenchClaw doctor");
  });

  test("does not report an active instance when multiple instance directories exist without a selection", async () => {
    const layout = await createLayout();
    await Bun.$`mkdir -p ${path.join(layout.runtimeStateRoot, "instances", "01", "settings")}`.quiet();
    await Bun.$`mkdir -p ${path.join(layout.runtimeStateRoot, "instances", "02", "workspace")}`.quiet();
    await Bun.write(path.join(layout.runtimeStateRoot, "instances", "01", "settings", "settings.json"), "{}\n");

    const report = collectDoctorReport({
      layout,
      version: "test-version",
      which: () => null,
      env: {},
    });

    expect(report.checks.find((check) => check.id === "active-instance")?.status).not.toBe("ok");
  });
});
