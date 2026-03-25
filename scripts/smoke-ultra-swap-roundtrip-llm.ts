#!/usr/bin/env bun
/**
 * Optional smoke: LLM + mocked Jupiter Ultra, two-leg SOL↔USDC round trip.
 * Retries the generateText call up to 5 times if the model skips tools or wrong order.
 *
 *   OPENROUTER_API_KEY=... bun run scripts/smoke-ultra-swap-roundtrip-llm.ts
 *
 * Uses instance AI settings when OPENROUTER_API_KEY is unset (same as other smokes).
 */
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";

import { loadAiSettings } from "../apps/trenchclaw/src/ai/llm/ai-settings-file";
import { resolveLlmRuntimeBinding } from "../apps/trenchclaw/src/ai/llm/client";
import { createLanguageModel } from "../apps/trenchclaw/src/ai/llm/config";
import type {
  JupiterUltraExecuteRequest,
  JupiterUltraOrderRequest,
} from "../apps/trenchclaw/src/solana/lib/adapters/jupiter-ultra";
import { ultraSwapAction } from "../apps/trenchclaw/src/tools/trading/ultra/swap";

const INSTANCE_ID = "01";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const OPENROUTER_KEY =
  process.env.OPENROUTER_API_KEY?.trim() || process.env.TRENCHCLAW_SMOKE_OPENROUTER_API_KEY?.trim();

const resolveModel = async () => {
  process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID?.trim() || INSTANCE_ID;
  const binding = await resolveLlmRuntimeBinding();
  if (binding.languageModel) {
    return binding.languageModel;
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

const main = async (): Promise<void> => {
  const model = await resolveModel();
  if (!model) {
    throw new Error("Need a configured LLM (instance vault) or OPENROUTER_API_KEY + openrouter in ai settings.");
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
          raw: { requestId: `req-${n}`, inAmount: "1000000", outAmount: "50000" },
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
      address: "SmokeSwap1111111111111111111111111111111",
      async signBase64Transaction(base64Transaction: string) {
        return `signed:${base64Transaction}`;
      },
    },
    rpcUrl: "https://rpc.example",
  } as never;

  const managedUltraSwap = tool({
    description:
      "Jupiter Ultra swap (same execution path as managedSwap with provider ultra). ExactIn ui amounts.",
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

  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    orderRequests.length = 0;
    // eslint-disable-next-line no-await-in-loop
    const result = await generateText({
      model,
      system:
        "You MUST call managedUltraSwap exactly twice in order: " +
        "(1) SOL -> USDC, amount 0.001 ui (2) USDC -> SOL, amount 0.05 ui. " +
        "If ok is false, retry that same leg with the same coins until ok true. " +
        "Finish with one line containing ROUNDTRIP_OK.",
      prompt: `Attempt ${attempt}/${maxAttempts}: run both legs.`,
      tools: { managedUltraSwap },
      stopWhen: stepCountIs(16),
      temperature: 0,
    });

    const okOrder =
      orderRequests.length >= 2 &&
      orderRequests[0]!.inputMint === SOL_MINT &&
      orderRequests[0]!.outputMint === USDC_MINT &&
      orderRequests[1]!.inputMint === USDC_MINT &&
      orderRequests[1]!.outputMint === SOL_MINT;

    if (okOrder && /ROUNDTRIP_OK/i.test(result.text)) {
      console.log("[smoke-ultra-swap-roundtrip-llm] success", {
        attempts: attempt,
        toolCalls: result.toolCalls?.length ?? 0,
        legs: orderRequests.length,
      });
      return;
    }

    console.warn("[smoke-ultra-swap-roundtrip-llm] retry", {
      attempt,
      legs: orderRequests.length,
      toolCalls: result.toolCalls?.length ?? 0,
    });
  }

  throw new Error("Model did not complete SOL->USDC->SOL with ROUNDTRIP_OK after retries.");
};

await main();
