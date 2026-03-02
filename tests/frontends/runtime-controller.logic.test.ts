import { describe, expect, test } from "bun:test";
import type { GuiInstanceProfileView } from "../../apps/trenchclaw/types/index";
import {
  applyCreateInstanceSuccess,
  buildCreateInstanceRequest,
  resolvePhaseAfterBootstrap,
  resolveSignInAction,
} from "../../apps/frontends/gui/src/features/runtime/runtime-controller.logic";

const makeInstance = (overrides: Partial<GuiInstanceProfileView> = {}): GuiInstanceProfileView => ({
  fileName: "user-1.json",
  localInstanceId: "0001",
  name: "Alpha Desk",
  safetyProfile: "dangerous",
  userPinRequired: false,
  createdAt: "2026-03-02T00:00:00.000Z",
  updatedAt: "2026-03-02T00:00:00.000Z",
  ...overrides,
});

describe("runtime controller onboarding logic", () => {
  test("bootstrap with no active instance routes to login", () => {
    expect(resolvePhaseAfterBootstrap(null)).toBe("login");
  });

  test("bootstrap with an active instance routes to app", () => {
    expect(resolvePhaseAfterBootstrap(makeInstance())).toBe("app");
  });

  test("create instance request includes name, safety profile, and optional pin then routes to login", () => {
    const request = buildCreateInstanceRequest({
      name: "  Alpha Desk  ",
      safetyProfile: "veryDangerous",
      pin: "  1234  ",
    });

    expect(request).toEqual({
      name: "Alpha Desk",
      safetyProfile: "veryDangerous",
      userPin: "1234",
    });

    const next = applyCreateInstanceSuccess([], makeInstance({ localInstanceId: "0042" }));
    expect(next.phase).toBe("login");
    expect(next.signInInstanceId).toBe("0042");
    expect(next.signInPin).toBe("");
    expect(next.showCreateModal).toBe(false);
  });

  test("sign in selection routes to create flow when sentinel option is selected", () => {
    expect(resolveSignInAction("__create_new__", "__create_new__")).toBe("open-create");
  });
});
