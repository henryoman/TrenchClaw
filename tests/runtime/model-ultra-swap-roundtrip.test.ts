import { describe, expect, test } from "bun:test";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";

import { loadAiSettings } from "../../apps/trenchclaw/src/ai/llm/ai-settings-file";
import { resolveLlmRuntimeBinding } from "../../apps/trenchclaw/src/ai/llm/client";
import { createLanguageModel } from "../../apps/trenchclaw/src/ai/llm/config";
import type {
  JupiterUltraExecuteRequest,
  JupiterUltraOrderRequest,
} from "../../apps/trenchclaw/src/solana/lib/adapters/jupiter-ultra";
import { ultraSwapAction } from "../../apps/trenchclaw/src/solana/actions/wallet-based/swap/ultra/swap";

const OPENROUTER_KEY =
  process.env.OPENROUTER_API_KEY?.trim() || process.env.TRENCHCLAW_SMOKE_OPENROUTER_API_KEY?.trim();

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const resolveSmokeLanguageModel = async () => {
  const fromVault = await resolveLlmRuntimeBinding();
  if (fromVault.languageModel) {
    return fromVault.languageModel;
  }
  if (!OPENROUTER_KEY) {
    return null;
  }
  const { settings } = await loadAiSettings();
  if (settings.provider !== "openrouter") {
    return null;
  }
  return createLanguageModel({
    provider: "openrouter",
    apiKey: OPENROUTER_KEY,
    model: settings.model.trim(),
    baseURL: "https://openrouter.ai/api/v1",
  });
};

describe.skipIf(!OPENROUTER_KEY)("model drives Ultra swap round trip (mocked Jupiter)", () => {
  test(
    "LLM calls managedUltraSwap twice: SOL->USDC then USDC->SOL",
    async () => {
      process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID?.trim() || "01";

      const model = await resolveSmokeLanguageModel();
      if (!model) {
        throw new Error("Expected language model (vault OpenRouter or OPENROUTER_API_KEY)");
      }

      const orderRequests: JupiterUltraOrderRequest[] = [];

      const swapCtx = {
        jupiterUltra: {
          async getOrder(request: JupiterUltraOrderRequest) {
            orderRequests.push(request);
            const n = orderRequests.length;
            return {
              requestId: `req-${n}`,
              transaction: `unsigned-swap-tx-${n}`,
              raw: {
                requestId: `req-${n}`,
                inAmount: "1000000",
                outAmount: "50000",
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
          address: "ModelSwapTest111111111111111111111111111111",
          async signBase64Transaction(base64Transaction: string) {
            return `signed:${base64Transaction}`;
          },
        },
        rpcUrl: "https://rpc.example",
      } as never;

      const managedUltraSwap = tool({
        description:
          "Jupiter Ultra swap (same stack as operator managedSwap when provider is ultra). " +
          "Use ExactIn ui amounts.",
        inputSchema: z.object({
          inputCoin: z.string().min(1),
          outputCoin: z.string().min(1),
          amount: z.union([z.number().positive(), z.string().min(1)]),
          amountUnit: z.enum(["ui", "native"]).optional(),
        }),
        execute: async (input) => {
          const result = await ultraSwapAction.execute(swapCtx, {
            inputCoin: input.inputCoin,
            outputCoin: input.outputCoin,
            amount: input.amount,
            amountUnit: input.amountUnit,
            mode: "ExactIn",
          });
          return {
            ok: result.ok,
            error: result.ok ? undefined : result.error,
            status: result.ok ? result.data?.status : undefined,
            signature: result.ok ? result.data?.signature : undefined,
          };
        },
      });

      const result = await generateText({
        model,
        system:
          "You control swaps via managedUltraSwap. You MUST call it exactly twice in this order:\n" +
          "1) inputCoin SOL, outputCoin USDC, amount 0.001, amountUnit ui\n" +
          "2) inputCoin USDC, outputCoin SOL, amount 0.05, amountUnit ui\n" +
          "If a call returns ok false, fix parameters and retry that leg until ok true. " +
          "After both legs succeed, end with a single line containing the substring ROUNDTRIP_OK.",
        prompt: "Execute the two swap legs now.",
        tools: { managedUltraSwap },
        stopWhen: stepCountIs(16),
        temperature: 0,
      });

      expect(result.toolCalls?.length ?? 0).toBeGreaterThanOrEqual(2);

      const ultraCalls = (result.toolCalls ?? []).filter((c) => c.toolName === "managedUltraSwap");
      expect(ultraCalls.length).toBeGreaterThanOrEqual(2);

      expect(orderRequests.length).toBeGreaterThanOrEqual(2);
      expect(orderRequests[0]!.inputMint).toBe(SOL_MINT);
      expect(orderRequests[0]!.outputMint).toBe(USDC_MINT);
      expect(orderRequests[1]!.inputMint).toBe(USDC_MINT);
      expect(orderRequests[1]!.outputMint).toBe(SOL_MINT);

      expect(result.text).toMatch(/ROUNDTRIP_OK/i);
    },
    180_000,
  );
});
