import { describe, expect, test } from "bun:test";

import type {
  JupiterUltraExecuteRequest,
  JupiterUltraOrderRequest,
} from "../../../../apps/trenchclaw/src/solana/lib/adapters/jupiter-ultra";
import { ultraSwapAction } from "../../../../apps/trenchclaw/src/solana/actions/wallet-based/swap/ultra/swap";

describe("ultra swap actions", () => {
  test("uses Ultra-managed execution settings for a simple swap", async () => {
    let capturedOrderRequest: JupiterUltraOrderRequest | null = null;
    let capturedExecuteRequest: JupiterUltraExecuteRequest | null = null;

    const result = await ultraSwapAction.execute(
      {
        jupiterUltra: {
          async getOrder(request: Record<string, unknown>) {
            capturedOrderRequest = request as unknown as JupiterUltraOrderRequest;
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
            capturedExecuteRequest = request as unknown as JupiterUltraExecuteRequest;
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
    const orderRequest = capturedOrderRequest as JupiterUltraOrderRequest;
    const executeRequest = capturedExecuteRequest as JupiterUltraExecuteRequest;

    expect(orderRequest.inputMint).toBe("So11111111111111111111111111111111111111112");
    expect(orderRequest.outputMint).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    expect(orderRequest.amount).toBe("250000000");
    expect(orderRequest.taker).toBe("wallet-1");
    expect(orderRequest.swapMode).toBe("ExactIn");
    expect(orderRequest.slippageBps).toBeUndefined();

    expect(executeRequest).toEqual({
      requestId: "req-1",
      signedTransaction: "signed:unsigned-swap-tx",
    });

    expect(result.data?.status).toBe("Success");
    expect(result.data?.execute?.signature).toBe("swap-sig-1");
    expect(result.data?.telemetry.slippageStrategy).toBe("ultra-managed");
    expect(result.data?.telemetry.feeStrategy).toBe("ultra-managed");
  });
});
