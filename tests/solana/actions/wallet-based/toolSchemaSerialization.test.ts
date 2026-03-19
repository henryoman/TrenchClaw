import { describe, expect, test } from "bun:test";
import { zodSchema } from "ai";

import { managedUltraSwapAction } from "../../../../apps/trenchclaw/src/solana/actions/wallet-based/swap/ultra/managedSwap";
import { scheduleManagedUltraSwapAction } from "../../../../apps/trenchclaw/src/solana/actions/wallet-based/swap/ultra/scheduleManagedSwap";
import { ultraSwapAction } from "../../../../apps/trenchclaw/src/solana/actions/wallet-based/swap/ultra/swap";
import { privacySwapAction, privacyTransferAction } from "../../../../apps/trenchclaw/src/solana/actions/wallet-based/transfer/privacyCash";

describe("wallet action tool schema serialization", () => {
  test.each([
    managedUltraSwapAction,
    scheduleManagedUltraSwapAction,
    ultraSwapAction,
    privacyTransferAction,
    privacySwapAction,
  ])("%s serializes to a top-level object JSON schema", async (action) => {
    expect(action.inputSchema).toBeDefined();

    const schema = zodSchema(action.inputSchema as never);
    const jsonSchema = await schema.jsonSchema;
    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.type).toBe("object");
  });
});
