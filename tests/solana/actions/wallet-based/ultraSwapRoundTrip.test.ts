import { describe, expect, test } from "bun:test";

import type {
  JupiterUltraExecuteRequest,
  JupiterUltraOrderRequest,
} from "../../../../apps/trenchclaw/src/solana/lib/adapters/jupiter-ultra";
import { ultraSwapAction } from "../../../../apps/trenchclaw/src/tools/trading/ultra/swap";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

describe("ultra swap round trip (SOL -> USDC -> SOL)", () => {
  test("runs two sequential mocked Ultra swaps with correct mint routing", async () => {
    const orderRequests: JupiterUltraOrderRequest[] = [];

    const ctx = {
      jupiterUltra: {
        async getOrder(request: JupiterUltraOrderRequest) {
          orderRequests.push(request);
          const n = orderRequests.length;
          return {
            requestId: `req-${n}`,
            transaction: `unsigned-swap-tx-${n}`,
            raw: {
              requestId: `req-${n}`,
              inAmount: n === 1 ? "1000000" : "50000",
              outAmount: n === 1 ? "50000" : "900000",
            },
          };
        },
        async executeOrder(request: JupiterUltraExecuteRequest) {
          return {
            status: "Success",
            signature: `sig-${request.requestId}`,
            raw: { status: "Success", signature: `sig-${request.requestId}` },
          };
        },
      },
      tokenAccounts: {
        async getSolBalance() {
          return 10;
        },
        async getTokenBalance() {
          return 1_000_000;
        },
        async hasTokenAccount() {
          return true;
        },
        async getDecimals(mintAddress: string) {
          return mintAddress === USDC_MINT ? 6 : 9;
        },
      },
      ultraSigner: {
        address: "RoundTripWallet11111111111111111111111111111",
        async signBase64Transaction(base64Transaction: string) {
          return `signed:${base64Transaction}`;
        },
      },
      rpcUrl: "https://rpc.example",
    } as never;

    const first = await ultraSwapAction.execute(ctx, {
      inputCoin: "SOL",
      outputCoin: "USDC",
      amount: "0.001",
      amountUnit: "ui",
      mode: "ExactIn",
    });

    expect(first.ok).toBe(true);

    const second = await ultraSwapAction.execute(ctx, {
      inputCoin: "USDC",
      outputCoin: "SOL",
      amount: "0.05",
      amountUnit: "ui",
      mode: "ExactIn",
    });

    expect(second.ok).toBe(true);

    expect(orderRequests).toHaveLength(2);
    expect(orderRequests[0]!.inputMint).toBe(SOL_MINT);
    expect(orderRequests[0]!.outputMint).toBe(USDC_MINT);
    expect(orderRequests[1]!.inputMint).toBe(USDC_MINT);
    expect(orderRequests[1]!.outputMint).toBe(SOL_MINT);
  });
});
