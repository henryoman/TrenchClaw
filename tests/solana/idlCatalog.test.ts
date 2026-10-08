import { describe, expect, test } from "bun:test";

interface AnchorInstruction {
  name: string;
  accounts: { name: string; address?: string; signer?: boolean; writable?: boolean }[];
}

interface AnchorIdl {
  instructions: AnchorInstruction[];
  types: { name: string; type: { fields: { name: string; type: unknown }[] } }[];
}

const clmm: AnchorIdl = await Bun.file(new URL("../../idl/raydium-clmm.json", import.meta.url)).json();
const cpmm: AnchorIdl = await Bun.file(new URL("../../idl/raydium-cpmm.json", import.meta.url)).json();

describe("current published interfaces", () => {
  test.each([
    ["pump-fun.json", ["buy_v3", "sell_v3", "multi_hop_curve_swap"]],
    ["pump-amm.json", ["buy_v2", "sell_v2", "multi_hop_swap"]],
    ["pump-fees.json", ["get_fees_with_quote_mint", "update_fee_shares_v2"]],
    ["spl-token.json", ["withdrawExcessLamports", "unwrapLamports", "batch"]],
    ["spl-token-2022.json", ["initializePermissionedBurn", "permissionedBurnChecked", "batch"]],
    ["jupiter.json", ["route_v2", "exact_out_route_v2", "shared_accounts_route_v2"]],
    ["mpl-token-metadata.json", ["resize", "closeAccounts"]],
  ] as const)("%s includes current program operations", async (file, operations) => {
    const root = await Bun.file(new URL(`../../idl/${file}`, import.meta.url)).json();
    const program = root.program ?? root;
    expect(program.instructions.map(({ name }: { name: string }) => name)).toEqual(
      expect.arrayContaining([...operations]),
    );
  });
});

describe("current Raydium interfaces", () => {
  test("includes CLMM rent collection and permissioned pool operations", () => {
    expect(clmm.instructions.map(({ name }) => name)).toEqual(expect.arrayContaining([
      "collect_excess_lamports", "create_permissioned_pool", "create_permission_pda",
      "close_permission_pda", "close_support_mint_associated",
    ]));
    const config = clmm.instructions.find(({ name }) => name === "create_amm_config");
    expect(config?.accounts[0]).toMatchObject({
      name: "owner", address: "GThUX1Atko4tqhN2NaiTazWSeFWMuiUvfFnyJyUghFMJ", signer: true,
    });
  });

  test("includes CPMM creator-fee sharing and permissionless collection", () => {
    expect(cpmm.instructions.map(({ name }) => name)).toEqual(expect.arrayContaining([
      "create_creator_fee_share", "close_creator_fee_share", "collect_creator_fee_permissionless",
      "collect_excess_lamports", "create_support_mint_associated", "close_support_mint_associated",
    ]));
    for (const name of ["collect_creator_fee", "collect_creator_fee_permissionless"]) {
      const instruction = cpmm.instructions.find((entry) => entry.name === name);
      expect(instruction?.accounts.map((account) => account.name)).toEqual(expect.arrayContaining([
        "amm_config", "creator_fee_share",
      ]));
    }
    const config = cpmm.types.find(({ name }) => name === "AmmConfig");
    expect(config?.type.fields.find(({ name }) => name === "creator_fee_share_rate")).toMatchObject({
      name: "creator_fee_share_rate", type: "u64",
    });
    const share = cpmm.types.find(({ name }) => name === "CreatorFeeShare");
    expect(share?.type.fields.map(({ name }) => name)).toEqual([
      "bump", "creator", "amm_config", "share_rate", "padding",
    ]);
  });

  test("uses program source generation instead of the outdated IDL mirror", async () => {
    const manifest = await Bun.file(new URL("../../idl/sources.json", import.meta.url)).json();
    for (const [file, repository, path] of [
      ["raydium-clmm.json", "raydium-io/raydium-clmm", "programs/amm"],
      ["raydium-cpmm.json", "raydium-io/raydium-cp-swap", "programs/cp-swap"],
    ]) {
      expect(manifest.sources.find((source: { file: string }) => source.file === file)).toMatchObject({
        kind: "anchor-build", repository, path, generator: "anchor-lang-idl@0.1.4",
      });
    }
  });
});
