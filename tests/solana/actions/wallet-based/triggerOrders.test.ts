import { afterEach, describe, expect, test } from "bun:test";

import { InMemoryStateStore, createActionContext } from "../../../../apps/trenchclaw/src/ai";
import {
  triggerOrderAction,
} from "../../../../apps/trenchclaw/src/tools/trading/trigger/createOrder";
import { getTriggerOrdersAction } from "../../../../apps/trenchclaw/src/tools/trading/trigger/getOrders";
import { triggerCancelOrdersAction } from "../../../../apps/trenchclaw/src/tools/trading/trigger/cancelOrders";

const MUTABLE_ENV_KEYS = [
  "TRENCHCLAW_VAULT_FILE",
  "TRENCHCLAW_VAULT_TEMPLATE_FILE",
] as const;
const initialEnv = Object.fromEntries(MUTABLE_ENV_KEYS.map((key) => [key, process.env[key]]));
const createdFiles: string[] = [];
const initialFetch = globalThis.fetch;

const writeVaultJson = async (apiKey: string): Promise<string> => {
  const target = `/tmp/trenchclaw-trigger-orders-vault-${crypto.randomUUID()}.json`;
  await Bun.write(
    target,
    JSON.stringify(
      {
        integrations: {
          jupiter: {
            "api-key": apiKey,
          },
        },
      },
      null,
      2,
    ),
  );
  createdFiles.push(target);
  return target;
};

afterEach(async () => {
  globalThis.fetch = initialFetch;

  for (const key of MUTABLE_ENV_KEYS) {
    const initial = initialEnv[key];
    if (initial === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = initial;
  }

  for (const filePath of createdFiles.splice(0)) {
    await Bun.$`rm -f ${filePath}`.quiet();
  }
});

describe("trigger order actions", () => {
  test("creates an exact-price trigger order with derived making and taking amounts", async () => {
    let capturedCreateBody: Record<string, unknown> | null = null;

    const result = await triggerOrderAction.execute(
      createActionContext({
        jupiterTrigger: {
          async createOrder(request: Record<string, unknown>) {
            capturedCreateBody = request;
            return {
              requestId: "trigger-req-1",
              transaction: "unsigned-trigger-tx",
              order: "trigger-order-1",
              raw: {},
            };
          },
          async executeOrder() {
            return {
              status: "Success",
              signature: "trigger-sig-1",
              raw: { status: "Success", signature: "trigger-sig-1" },
            };
          },
        },
        tokenAccounts: {
          async getSolBalance() {
            return 0;
          },
          async getTokenBalance() {
            return 0;
          },
          async getDecimals(mintAddress: string) {
            return mintAddress === "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" ? 6 : 9;
          },
        },
      }),
      {
        maker: "wallet-1",
        payer: "wallet-1",
        inputCoin: "JUP",
        outputCoin: "SOL",
        amount: "2",
        amountUnit: "ui",
        direction: "sellAbove",
        trigger: {
          kind: "exactPrice",
          price: "0.005",
        },
        signedTransaction: "signed-trigger-tx",
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(capturedCreateBody).toMatchObject({
      maker: "wallet-1",
      payer: "wallet-1",
      inputMint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
      outputMint: "So11111111111111111111111111111111111111112",
      computeUnitPrice: "auto",
      params: {
        makingAmount: "2000000",
        takingAmount: "10000000",
      },
    });
    expect(capturedCreateBody).not.toHaveProperty("wrapAndUnwrapSol");
    expect(result.data?.derivedTriggerPrice).toBe("0.005");
    expect(result.data?.triggerMode).toBe("exactPrice");
    expect(result.data?.signature).toBe("trigger-sig-1");
    expect(result.data?.tracking).toEqual({
      action: "getTriggerOrders",
      user: "wallet-1",
      orderStatus: "active",
      order: "trigger-order-1",
    });
  });

  test("sends wrapAndUnwrapSol when selling native SOL (input mint)", async () => {
    let capturedCreateBody: Record<string, unknown> | null = null;

    const result = await triggerOrderAction.execute(
      createActionContext({
        jupiterTrigger: {
          async createOrder(request: Record<string, unknown>) {
            capturedCreateBody = request;
            return {
              requestId: "trigger-req-sol",
              transaction: "unsigned-trigger-tx",
              order: "trigger-order-sol",
              raw: {},
            };
          },
          async executeOrder() {
            return {
              status: "Success",
              signature: "trigger-sig-sol",
              raw: { status: "Success", signature: "trigger-sig-sol" },
            };
          },
        },
        tokenAccounts: {
          async getSolBalance() {
            return 0;
          },
          async getTokenBalance() {
            return 0;
          },
          async getDecimals(mintAddress: string) {
            return mintAddress === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" ? 6 : 9;
          },
        },
      }),
      {
        maker: "wallet-1",
        payer: "wallet-1",
        inputCoin: "SOL",
        outputCoin: "USDC",
        amount: "0.06",
        amountUnit: "ui",
        direction: "sellAbove",
        trigger: {
          kind: "exactPrice",
          price: "94.21",
        },
        signedTransaction: "signed-trigger-tx",
      },
    );

    expect(result.ok).toBe(true);
    expect(capturedCreateBody).toMatchObject({
      inputMint: "So11111111111111111111111111111111111111112",
      outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      computeUnitPrice: "auto",
      wrapAndUnwrapSol: true,
    });
  });

  test("derives a relative trigger price from an explicit buy price", async () => {
    let capturedCreateBody: Record<string, unknown> | null = null;

    const result = await triggerOrderAction.execute(
      createActionContext({
        jupiterTrigger: {
          async createOrder(request: Record<string, unknown>) {
            capturedCreateBody = request;
            return {
              requestId: "trigger-req-2",
              transaction: "unsigned-trigger-tx",
              order: "trigger-order-2",
              raw: {},
            };
          },
          async executeOrder() {
            return {
              status: "Success",
              signature: "trigger-sig-2",
              raw: { status: "Success", signature: "trigger-sig-2" },
            };
          },
        },
        tokenAccounts: {
          async getSolBalance() {
            return 0;
          },
          async getTokenBalance() {
            return 0;
          },
          async getDecimals(mintAddress: string) {
            return mintAddress === "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" ? 6 : 9;
          },
        },
      }),
      {
        maker: "wallet-1",
        payer: "wallet-1",
        inputCoin: "JUP",
        outputCoin: "SOL",
        amount: "100",
        amountUnit: "ui",
        direction: "sellAbove",
        trigger: {
          kind: "percentFromBuyPrice",
          percent: 25,
        },
        buyPrice: "0.01",
        signedTransaction: "signed-trigger-tx",
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(capturedCreateBody).toMatchObject({
      params: {
        makingAmount: "100000000",
        takingAmount: "1250000000",
      },
    });
    expect(result.data?.derivedBuyPrice).toBe("0.01");
    expect(result.data?.derivedTriggerPrice).toBe("0.0125");
  });

  test("derives a relative trigger price from recent runtime receipts when buy price is omitted", async () => {
    const stateStore = new InMemoryStateStore();
    stateStore.saveReceipt({
      ok: true,
      retryable: false,
      durationMs: 1,
      timestamp: Date.now(),
      idempotencyKey: "receipt-1",
      data: {
        telemetry: {
          walletAddress: "wallet-1",
          inputMint: "So11111111111111111111111111111111111111112",
          outputMint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
          quoteInAmount: "2000000000",
          outAmount: "400000000",
        },
      },
    });

    const result = await triggerOrderAction.execute(
      createActionContext({
        jupiterTrigger: {
          async createOrder() {
            return {
              requestId: "trigger-req-3",
              transaction: "unsigned-trigger-tx",
              order: "trigger-order-3",
              raw: {},
            };
          },
          async executeOrder() {
            return {
              status: "Success",
              signature: "trigger-sig-3",
              raw: { status: "Success", signature: "trigger-sig-3" },
            };
          },
        },
        tokenAccounts: {
          async getSolBalance() {
            return 0;
          },
          async getTokenBalance() {
            return 0;
          },
          async getDecimals(mintAddress: string) {
            return mintAddress === "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" ? 6 : 9;
          },
        },
        stateStore,
      }),
      {
        maker: "wallet-1",
        payer: "wallet-1",
        inputCoin: "JUP",
        outputCoin: "SOL",
        amount: "10",
        amountUnit: "ui",
        direction: "sellAbove",
        trigger: {
          kind: "percentFromBuyPrice",
          percent: 20,
        },
        signedTransaction: "signed-trigger-tx",
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data?.derivedBuyPrice).toBe("0.005");
    expect(result.data?.derivedTriggerPrice).toBe("0.006");
  });

  test("fails with a precise error when no buy price can be derived", async () => {
    const result = await triggerOrderAction.execute(
      createActionContext({
        jupiterTrigger: {
          async createOrder() {
            throw new Error("should not be called");
          },
          async executeOrder() {
            throw new Error("should not be called");
          },
        },
        tokenAccounts: {
          async getSolBalance() {
            return 0;
          },
          async getTokenBalance() {
            return 0;
          },
          async getDecimals() {
            return 9;
          },
        },
      }),
      {
        maker: "wallet-1",
        payer: "wallet-1",
        inputCoin: "JUP",
        outputCoin: "SOL",
        amount: "10",
        amountUnit: "ui",
        direction: "sellAbove",
        trigger: {
          kind: "percentFromBuyPrice",
          percent: 20,
        },
        signedTransaction: "signed-trigger-tx",
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toContain("Pass buyPrice explicitly");
  });

  test("lazily resolves the trigger adapter from the shared Jupiter vault key", async () => {
    process.env.TRENCHCLAW_VAULT_FILE = await writeVaultJson("vault-trigger-key");
    globalThis.fetch = (async (url: URL | RequestInfo) => {
      expect(String(url)).toContain("/getTriggerOrders?");
      return new Response(JSON.stringify({
        user: "wallet-1",
        orderStatus: "active",
        orders: [],
        page: 1,
        totalPages: 1,
      }));
    }) as typeof fetch;

    const result = await getTriggerOrdersAction.execute(
      createActionContext({}),
      {
        user: "wallet-1",
        orderStatus: "active",
        page: 1,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data?.user).toBe("wallet-1");
    expect(result.data?.orderStatus).toBe("active");
    expect(result.data?.orders).toEqual([]);
  });

  test("normalizes Trigger V1 order listings", async () => {
    const result = await getTriggerOrdersAction.execute(
      createActionContext({
        jupiterTrigger: {
          async getTriggerOrders() {
            return {
              user: "wallet-1",
              orderStatus: "open",
              page: 1,
              totalPages: 2,
              orders: [
                {
                  orderKey: "order-1",
                  userPubkey: "wallet-1",
                  inputMint: "So11111111111111111111111111111111111111112",
                  outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                  makingAmount: "1.0",
                  takingAmount: "200.0",
                  status: "Open",
                },
              ],
              raw: {},
            };
          },
        },
      }),
      {
        user: "wallet-1",
        orderStatus: "active",
        page: 1,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data?.hasMoreData).toBe(true);
    expect(result.data?.orders[0]).toMatchObject({
      orderKey: "order-1",
      status: "Open",
      derivedTriggerPrice: "200",
    });
  });

  test("cancels trigger orders by signing and executing returned cancellation transactions", async () => {
    const executeRequests: Array<Record<string, unknown>> = [];

    const result = await triggerCancelOrdersAction.execute(
      createActionContext({
        jupiterTrigger: {
          async cancelOrders() {
            return {
              requestId: "cancel-req-1",
              transactions: ["unsigned-cancel-1", "unsigned-cancel-2"],
              raw: { requestId: "cancel-req-1" },
            };
          },
          async executeOrder(request: Record<string, unknown>) {
            executeRequests.push(request);
            return {
              status: "Success",
              signature: `sig-${executeRequests.length}`,
              raw: { status: "Success", signature: `sig-${executeRequests.length}` },
            };
          },
        },
        ultraSigner: {
          address: "wallet-1",
          async signBase64Transaction(base64Transaction: string) {
            return `signed:${base64Transaction}`;
          },
        },
      }),
      {
        maker: "wallet-1",
        orders: ["order-1", "order-2"],
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(executeRequests).toEqual([
      {
        requestId: "cancel-req-1",
        signedTransaction: "signed:unsigned-cancel-1",
      },
      {
        requestId: "cancel-req-1",
        signedTransaction: "signed:unsigned-cancel-2",
      },
    ]);
    expect(result.data?.signatures).toEqual(["sig-1", "sig-2"]);
    expect(result.data?.cancelledOrders).toEqual(["order-1", "order-2"]);
  });
});
