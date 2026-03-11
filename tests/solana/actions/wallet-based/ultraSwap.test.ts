import { describe, expect, test } from "bun:test";

import { ultraSwapAction } from "../../../../apps/trenchclaw/src/solana/actions/wallet-based/swap/ultra/swap";

describe("ultra swap actions", () => {
  test("uses Ultra-managed execution settings for a simple swap", async () => {
    let capturedOrderRequest: Record<string, unknown> | null = null;
    let capturedExecuteRequest: Record<string, unknown> | null = null;

    const result = await ultraSwapAction.execute(
      {
        jupiterUltra: {
          async getOrder(request: Record<string, unknown>) {
            capturedOrderRequest = request;
            return {
              requestId: "req-1",
              transaction: "unsigned-swap-tx",
              raw: {
                requestId: "req-1",
                inAmount: "250000000",
                outAmount: "37500000",
              },
            };
          },
          async executeOrder(request: Record<string, unknown>) {
            capturedExecuteRequest = request;
            return {
              status: "Success",
              signature: "swap-sig-1",
              raw: {
                status: "Success",
                signature: "swap-sig-1",
                outAmount: "37400000",
              },
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
        ultraSigner: {
          address: "wallet-1",
          async signBase64Transaction(base64Transaction: string) {
            return `signed:${base64Transaction}`;
          },
        },
        rpcUrl: "https://rpc.example",
      } as never,
      {
        inputCoin: "SOL",
        outputCoin: "USDC",
        amount: "0.25",
        amountUnit: "ui",
        mode: "ExactIn",
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(capturedOrderRequest).not.toBeNull();
    expect(capturedExecuteRequest).not.toBeNull();
    if (!capturedOrderRequest || !capturedExecuteRequest) {
      return;
    }

    expect(capturedOrderRequest.inputMint).toBe("So11111111111111111111111111111111111111112");
    expect(capturedOrderRequest.outputMint).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    expect(capturedOrderRequest.amount).toBe("250000000");
    expect(capturedOrderRequest.taker).toBe("wallet-1");
    expect(capturedOrderRequest.swapMode).toBe("ExactIn");
    expect(capturedOrderRequest.slippageBps).toBeUndefined();

    expect(capturedExecuteRequest).toEqual({
      requestId: "req-1",
      signedTransaction: "signed:unsigned-swap-tx",
    });

    expect(result.data?.status).toBe("Success");
    expect(result.data?.execute?.signature).toBe("swap-sig-1");
    expect(result.data?.telemetry.slippageStrategy).toBe("ultra-managed");
    expect(result.data?.telemetry.feeStrategy).toBe("ultra-managed");
  });
});
