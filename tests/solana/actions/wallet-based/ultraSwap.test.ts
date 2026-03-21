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
          async hasTokenAccount() {
            return true;
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

  test("extracts a mint from label-style token input", async () => {
    let capturedOrderRequest: JupiterUltraOrderRequest | null = null;

    const result = await ultraSwapAction.execute(
      {
        jupiterUltra: {
          async getOrder(request: Record<string, unknown>) {
            capturedOrderRequest = request as unknown as JupiterUltraOrderRequest;
            return {
              requestId: "req-2",
              transaction: "unsigned-swap-tx",
              raw: {
                requestId: "req-2",
              },
            };
          },
          async executeOrder() {
            return {
              status: "Success",
              raw: {
                status: "Success",
              },
            };
          },
        },
        tokenAccounts: {
          async getSolBalance() {
            return 1;
          },
          async getTokenBalance() {
            return 0;
          },
          async hasTokenAccount() {
            return true;
          },
          async getDecimals() {
            return 9;
          },
        },
        ultraSigner: {
          address: "wallet-2",
          async signBase64Transaction(base64Transaction: string) {
            return `signed:${base64Transaction}`;
          },
        },
        rpcUrl: "https://rpc.example",
      } as never,
      {
        inputCoin: "SOL",
        outputCoin: "YEPE - GaREwVYcNnvi55vPXtQFQYgspmzv3wypZfLSWWgJpump",
        amount: "0.1",
        amountUnit: "ui",
        mode: "ExactIn",
      },
    );

    expect(result.ok).toBe(true);
    expect(capturedOrderRequest).not.toBeNull();
    if (!capturedOrderRequest) {
      return;
    }

    const orderRequest = capturedOrderRequest as JupiterUltraOrderRequest;
    expect(orderRequest.outputMint).toBe("GaREwVYcNnvi55vPXtQFQYgspmzv3wypZfLSWWgJpump");
  });

  test("fails early when SOL cannot cover a new destination token account", async () => {
    let getOrderCalled = false;

    const result = await ultraSwapAction.execute(
      {
        jupiterUltra: {
          async getOrder() {
            getOrderCalled = true;
            return {
              requestId: "req-3",
              transaction: "unsigned-swap-tx",
              raw: {
                requestId: "req-3",
              },
            };
          },
          async executeOrder() {
            return {
              status: "Success",
              raw: {
                status: "Success",
              },
            };
          },
        },
        tokenAccounts: {
          async getSolBalance() {
            return 0.001452387;
          },
          async getTokenBalance() {
            return 0;
          },
          async hasTokenAccount() {
            return false;
          },
          async getDecimals() {
            return 9;
          },
        },
        ultraSigner: {
          address: "wallet-3",
          async signBase64Transaction(base64Transaction: string) {
            return `signed:${base64Transaction}`;
          },
        },
        rpcUrl: "https://rpc.example",
      } as never,
      {
        inputCoin: "SOL",
        outputCoin: "GaREwVYcNnvi55vPXtQFQYgspmzv3wypZfLSWWgJpump",
        amount: "20%",
        mode: "ExactIn",
      },
    );

    expect(result.ok).toBe(false);
    expect(getOrderCalled).toBe(false);
    expect(result.error).toContain("Insufficient SOL for a first-time buy");
    expect(result.error).toContain("0.00204428 SOL");
  });
});
