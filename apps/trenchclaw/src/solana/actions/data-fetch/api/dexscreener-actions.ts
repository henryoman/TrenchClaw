import { z } from "zod";

import type { Action } from "../../../../ai/runtime/types/action";
import {
  getDexscreenerLatestAds,
  getDexscreenerLatestCommunityTakeovers,
  getDexscreenerLatestTokenBoosts,
  getDexscreenerLatestTokenProfiles,
  getDexscreenerOrdersByToken,
  getDexscreenerPairByChainAndPairId,
  getDexscreenerTokenPairsByChain,
  getDexscreenerTokensByChain,
  getDexscreenerTopTokenBoosts,
  searchDexscreenerPairs,
} from "./dexscreener";

const nonEmptyStringSchema = z.string().trim().min(1);

const latestInputSchema = z.object({});
const tokenAddressInputSchema = z.object({
  tokenAddress: nonEmptyStringSchema,
});

const pairAddressInputSchema = z.object({
  pairAddress: nonEmptyStringSchema,
});

const searchPairsInputSchema = z.object({
  query: nonEmptyStringSchema,
});

const tokensInputSchema = z.object({
  tokenAddresses: z.array(nonEmptyStringSchema).min(1).max(30),
});

const createDexscreenerAction = <TInput, TOutput>(input: {
  name: string;
  inputSchema: z.ZodType<TInput>;
  execute: (input: TInput) => Promise<TOutput>;
}): Action<TInput, TOutput> => ({
  name: input.name,
  category: "data-based",
  inputSchema: input.inputSchema,
  async execute(_ctx, rawInput) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();

    try {
      const parsed = input.inputSchema.parse(rawInput);
      const data = await input.execute(parsed);
      return {
        ok: true,
        retryable: false,
        data,
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        retryable: false,
        error: message,
        code: "DEXSCREENER_ACTION_FAILED",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }
  },
});

export const getDexscreenerLatestTokenProfilesAction = createDexscreenerAction({
  name: "getDexscreenerLatestTokenProfiles",
  inputSchema: latestInputSchema,
  execute: async () => getDexscreenerLatestTokenProfiles(),
});

export const getDexscreenerLatestTokenBoostsAction = createDexscreenerAction({
  name: "getDexscreenerLatestTokenBoosts",
  inputSchema: latestInputSchema,
  execute: async () => getDexscreenerLatestTokenBoosts(),
});

export const getDexscreenerTopTokenBoostsAction = createDexscreenerAction({
  name: "getDexscreenerTopTokenBoosts",
  inputSchema: latestInputSchema,
  execute: async () => getDexscreenerTopTokenBoosts(),
});

export const getDexscreenerOrdersByTokenAction = createDexscreenerAction({
  name: "getDexscreenerOrdersByToken",
  inputSchema: tokenAddressInputSchema,
  execute: async (input) => getDexscreenerOrdersByToken({ tokenAddress: input.tokenAddress }),
});

export const searchDexscreenerPairsAction = createDexscreenerAction({
  name: "searchDexscreenerPairs",
  inputSchema: searchPairsInputSchema,
  execute: async (input) => searchDexscreenerPairs({ query: input.query }),
});

export const getDexscreenerPairByChainAndPairIdAction = createDexscreenerAction({
  name: "getDexscreenerPairByChainAndPairId",
  inputSchema: pairAddressInputSchema,
  execute: async (input) => getDexscreenerPairByChainAndPairId({ pairAddress: input.pairAddress }),
});

export const getDexscreenerTokenPairsByChainAction = createDexscreenerAction({
  name: "getDexscreenerTokenPairsByChain",
  inputSchema: tokenAddressInputSchema,
  execute: async (input) => getDexscreenerTokenPairsByChain({ tokenAddress: input.tokenAddress }),
});

export const getDexscreenerTokensByChainAction = createDexscreenerAction({
  name: "getDexscreenerTokensByChain",
  inputSchema: tokensInputSchema,
  execute: async (input) => getDexscreenerTokensByChain({ tokenAddresses: input.tokenAddresses }),
});

export const getDexscreenerLatestCommunityTakeoversAction = createDexscreenerAction({
  name: "getDexscreenerLatestCommunityTakeovers",
  inputSchema: latestInputSchema,
  execute: async () => getDexscreenerLatestCommunityTakeovers(),
});

export const getDexscreenerLatestAdsAction = createDexscreenerAction({
  name: "getDexscreenerLatestAds",
  inputSchema: latestInputSchema,
  execute: async () => getDexscreenerLatestAds(),
});
