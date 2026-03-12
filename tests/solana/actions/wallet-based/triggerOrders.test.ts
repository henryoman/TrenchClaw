import { describe, expect, test } from "bun:test";

import type {
  JupiterTriggerCreateOrderRequest,
  JupiterTriggerExecuteRequest,
  JupiterTriggerGetOrdersRequest,
} from "../../../../apps/trenchclaw/src/solana/lib/adapters/jupiter-trigger";
import { triggerCancelOrdersAction } from "../../../../apps/trenchclaw/src/solana/actions/wallet-based/swap/trigger/cancelOrders";
import { getTriggerOrdersAction } from "../../../../apps/trenchclaw/src/solana/actions/wallet-based/swap/trigger/getOrders";
import { triggerOrderAction } from "../../../../apps/trenchclaw/src/solana/actions/wallet-based/swap/trigger/order";

describe("trigger order actions", () => {
  test("creates and executes a Jupiter Trigger order from a limit price", async () => {
    let capturedCreateRequest: JupiterTriggerCreateOrderRequest | null = null;
    let capturedExecuteRequest: JupiterTriggerExecuteRequest | null = null;

    const result = await triggerOrderAction.execute(
      {
        jupiterTrigger: {
          async createOrder(request: Record<string, unknown>) {
            capturedCreateRequest = request as unknown as JupiterTriggerCreateOrderRequest;
            return {
              requestId: "req-1",
              transaction: "unsigned-order-tx",
              order: "order-1",
              raw: {
                order: "order-1",
                requestId: "req-1",
              },
            };
          },
          async executeOrder(request: Record<string, unknown>) {
            capturedExecuteRequest = request as unknown as JupiterTriggerExecuteRequest;
            return {
              status: "Success",
              signature: "sig-1",
              raw: {
                status: "Success",
                signature: "sig-1",
              },
            };
          },
        },
        tokenAccounts: {
          async getDecimals(mintAddress: string) {
            return mintAddress === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" ? 6 : 9;
          },
        },
        ultraSigner: {
          address: "maker-wallet",
          async signBase64Transaction(base64Transaction: string) {
            return `signed:${base64Transaction}`;
          },
        },
      } as never,
      {
        inputCoin: "SOL",
        outputCoin: "USDC",
        makingAmount: "0.5",
        limitPrice: "210",
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(capturedCreateRequest).not.toBeNull();
    expect(capturedExecuteRequest).not.toBeNull();
    if (!capturedCreateRequest || !capturedExecuteRequest) {
      return;
    }
    const createRequest = capturedCreateRequest as JupiterTriggerCreateOrderRequest;
    const executeRequest = capturedExecuteRequest as JupiterTriggerExecuteRequest;

    expect(createRequest).toEqual({
      inputMint: "So11111111111111111111111111111111111111112",
      outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      maker: "maker-wallet",
      payer: "maker-wallet",
      params: {
        makingAmount: "500000000",
        takingAmount: "105000000",
      },
    });
    expect(executeRequest).toEqual({
      requestId: "req-1",
      signedTransaction: "signed:unsigned-order-tx",
    });
    expect(result.data?.request.limitPrice).toBe("210");
    expect(result.data?.request.makingAmount).toBe("500000000");
    expect(result.data?.request.takingAmount).toBe("105000000");
    expect(result.data?.signature).toBe("sig-1");
  });

  test("lists trigger orders for the resolved wallet", async () => {
    let capturedQuery: JupiterTriggerGetOrdersRequest | null = null;

    const result = await getTriggerOrdersAction.execute(
      {
        jupiterTrigger: {
          async getTriggerOrders(query: Record<string, unknown>) {
            capturedQuery = query as unknown as JupiterTriggerGetOrdersRequest;
            return {
              page: 2,
              hasMoreData: true,
              orders: [{ orderKey: "order-1" }],
              raw: {
                orders: [{ orderKey: "order-1" }],
              },
            };
          },
        },
        ultraSigner: {
          address: "maker-wallet",
          async signBase64Transaction(base64Transaction: string) {
            return base64Transaction;
          },
        },
      } as never,
      {
        orderStatus: "active",
        page: 2,
        inputCoin: "SOL",
        outputCoin: "USDC",
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(capturedQuery).not.toBeNull();
    if (!capturedQuery) {
      return;
    }
    const query = capturedQuery as JupiterTriggerGetOrdersRequest;

    expect(query).toEqual({
      user: "maker-wallet",
      orderStatus: "active",
      page: 2,
      inputMint: "So11111111111111111111111111111111111111112",
      outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      includeFailedTx: undefined,
    });
    expect(result.data?.orders).toHaveLength(1);
    expect(result.data?.hasMoreData).toBe(true);
  });

  test("cancels a single trigger order and executes the cancellation", async () => {
    let cancelCalls = 0;
    let executeCalls = 0;

    const result = await triggerCancelOrdersAction.execute(
      {
        jupiterTrigger: {
          async cancelOrder() {
            cancelCalls += 1;
            return {
              requestId: "cancel-req-1",
              transaction: "unsigned-cancel-tx",
              raw: {},
            };
          },
          async executeOrder() {
            executeCalls += 1;
            return {
              status: "Success",
              signature: "cancel-sig-1",
              raw: {
                status: "Success",
                signature: "cancel-sig-1",
              },
            };
          },
        },
        ultraSigner: {
          address: "maker-wallet",
          async signBase64Transaction(base64Transaction: string) {
            return `signed:${base64Transaction}`;
          },
        },
      } as never,
      {
        order: "order-1",
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(cancelCalls).toBe(1);
    expect(executeCalls).toBe(1);
    expect(result.data?.orders).toEqual(["order-1"]);
    expect(result.data?.signatures).toEqual(["cancel-sig-1"]);
    expect(result.data?.statuses).toEqual(["Success"]);
  });
});
