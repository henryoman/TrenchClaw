import { afterEach, describe, expect, test } from "bun:test";

import { executeSwapAction } from "../../../../apps/trenchclaw/src/tools/trading/rpc/executeSwap";

const previousFetch = globalThis.fetch;

const createRpcResponse = (result: unknown): Response =>
  new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result,
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    },
  );

afterEach(() => {
  globalThis.fetch = previousFetch;
});

describe("executeSwapAction", () => {
  test("builds, simulates, signs, sends, and confirms a Jupiter standard swap", async () => {
    const taker = "9xQeWvG816bUx9EPfK5Yw9s6o1tuVd7a3mZ9zNnV3xF1";
    const submittedSignature = "1111111111111111111111111111111111111111111111111111111111111111";
    const rpcMethods: string[] = [];

    globalThis.fetch = (async (input, init) => {
      const request = input instanceof Request ? input : new Request(String(input), init);
      const payload = JSON.parse(await request.text()) as { method?: string };
      const method = String(payload.method ?? "");
      rpcMethods.push(method);

      if (method === "simulateTransaction") {
        return createRpcResponse({
          context: { slot: 123 },
          value: {
            err: null,
            unitsConsumed: 210_000,
          },
        });
      }

      if (method === "sendTransaction") {
        return createRpcResponse(submittedSignature);
      }

      if (method === "getSignatureStatuses") {
        return createRpcResponse({
          value: [
            {
              slot: 456,
              confirmationStatus: "confirmed",
              err: null,
            },
          ],
        });
      }

      throw new Error(`Unexpected RPC method: ${method}`);
    }) as typeof fetch;

    const result = await executeSwapAction.execute(
      {
        jupiter: {
          async buildSwap(request: Record<string, unknown>) {
            expect(request).toMatchObject({
              inputMint: "So11111111111111111111111111111111111111112",
              outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
              amount: "250000000",
              taker,
              slippageBps: 50,
            });

            return {
              inputMint: "So11111111111111111111111111111111111111112",
              outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
              inAmount: "250000000",
              outAmount: "37500000",
              computeBudgetInstructions: [],
              setupInstructions: [],
              swapInstruction: {
                programId: "11111111111111111111111111111111",
                accounts: [],
                data: "",
              },
              cleanupInstruction: null,
              otherInstructions: [],
              addressesByLookupTableAddress: null,
              blockhashWithMetadata: {
                blockhash: Array.from(Buffer.from("9xQeWvG816bUx9EPfK5Yw9s6o1tuVd7a3mZ9zNnV3xF1", "utf8")),
                lastValidBlockHeight: 999,
              },
              raw: {
                outAmount: "37500000",
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
          async getDecimals(mintAddress: string) {
            return mintAddress === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" ? 6 : 9;
          },
        },
        ultraSigner: {
          address: taker,
          async signBase64Transaction(base64Transaction: string) {
            expect(base64Transaction.length).toBeGreaterThan(0);
            return base64Transaction;
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

    expect(rpcMethods).toEqual([
      "simulateTransaction",
      "sendTransaction",
      "getSignatureStatuses",
    ]);
    expect(result.data?.status).toBe("Success");
    expect(result.data?.signature).toBe(submittedSignature);
    expect(result.data?.feeBps).toBe(0);
    expect(result.data?.telemetry.feeStrategy).toBe("self-rpc");
    expect(result.data?.execute?.computeUnitLimit).toBeGreaterThanOrEqual(252_000);
  });

  test("rejects ExactOut for the standard swap path", async () => {
    const taker = "9xQeWvG816bUx9EPfK5Yw9s6o1tuVd7a3mZ9zNnV3xF1";
    const result = await executeSwapAction.execute(
      {
        jupiter: {
          async buildSwap() {
            throw new Error("buildSwap should not be called for ExactOut");
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
          address: taker,
          async signBase64Transaction(base64Transaction: string) {
            return base64Transaction;
          },
        },
        rpcUrl: "https://rpc.example",
      } as never,
      {
        inputCoin: "SOL",
        outputCoin: "USDC",
        amount: "0.25",
        amountUnit: "ui",
        mode: "ExactOut",
      },
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("ExactIn");
  });
});
