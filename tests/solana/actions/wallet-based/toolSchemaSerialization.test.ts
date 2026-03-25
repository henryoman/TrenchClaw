import { describe, expect, test } from "bun:test";
import { zodSchema } from "ai";

import { getTriggerOrdersAction } from "../../../../apps/trenchclaw/src/tools/trading/trigger/getOrders";
import { managedTriggerCancelOrdersAction } from "../../../../apps/trenchclaw/src/tools/trading/trigger/cancelOrders";
import { managedTriggerOrderAction } from "../../../../apps/trenchclaw/src/tools/trading/trigger/managedCreateOrder";
import { managedUltraSwapAction } from "../../../../apps/trenchclaw/src/tools/trading/ultra/managedSwap";
import { scheduleManagedUltraSwapAction } from "../../../../apps/trenchclaw/src/tools/trading/ultra/scheduleManagedSwap";
import { ultraSwapAction } from "../../../../apps/trenchclaw/src/tools/trading/ultra/swap";
import { privacySwapAction, privacyTransferAction } from "../../../../apps/trenchclaw/src/tools/wallet/transfer/privacyCash";

describe("wallet action tool schema serialization", () => {
  test.each([
    getTriggerOrdersAction,
    managedTriggerOrderAction,
    managedTriggerCancelOrdersAction,
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
