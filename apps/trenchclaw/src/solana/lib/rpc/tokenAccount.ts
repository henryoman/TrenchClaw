import { address } from "@solana/kit";
import { createRateLimitedSolanaRpc } from "../rpc/client";
import { getTokenAccountsByOwner } from "../rpc/getTokenAccountsByOwner";
import { getTokenSupply } from "../rpc/getTokenSupply";
import { resolveRequiredRpcUrl } from "../rpc/urls";

const LAMPORTS_PER_SOL = 1_000_000_000;

export interface TokenAccountAdapterConfig {
  rpcUrl?: string;
}

export interface TokenAccountAdapter {
  getSolBalance(walletAddress: string): Promise<number>;
  getTokenBalance(walletAddress: string, mintAddress: string): Promise<number>;
  hasTokenAccount(walletAddress: string, mintAddress: string): Promise<boolean>;
  getDecimals(mintAddress: string): Promise<number>;
}

export const createTokenAccountAdapter = (
  config: TokenAccountAdapterConfig = {},
): TokenAccountAdapter => {
  const rpcUrl = resolveRequiredRpcUrl(config.rpcUrl);
  const rpc = createRateLimitedSolanaRpc(rpcUrl);
  const decimalsCache = new Map<string, number>();

  return {
    async getSolBalance(walletAddress: string): Promise<number> {
      const response = await rpc.getBalance(address(walletAddress)).send();
      return Number(response.value) / LAMPORTS_PER_SOL;
    },

    async getTokenBalance(walletAddress: string, mintAddress: string): Promise<number> {
      const response = await getTokenAccountsByOwner({
        rpcUrl,
        ownerAddress: walletAddress,
        mintAddress,
        encoding: "jsonParsed",
      });
      const entries = response.accounts.map((entry) => ({
        account: entry.account,
      }));
      let totalUiAmount = 0;

      for (const entry of entries) {
        const tokenAmount =
          entry &&
          typeof entry === "object" &&
          "account" in entry &&
          entry.account &&
          typeof entry.account === "object" &&
          "data" in entry.account &&
          entry.account.data &&
          typeof entry.account.data === "object" &&
          "parsed" in entry.account.data &&
          entry.account.data.parsed &&
          typeof entry.account.data.parsed === "object" &&
          "info" in entry.account.data.parsed &&
          entry.account.data.parsed.info &&
          typeof entry.account.data.parsed.info === "object" &&
          "tokenAmount" in entry.account.data.parsed.info
            ? (entry.account.data.parsed.info as Record<string, unknown>).tokenAmount
            : undefined;

        const uiAmount =
          tokenAmount &&
          typeof tokenAmount === "object" &&
          "uiAmount" in tokenAmount &&
          typeof (tokenAmount as Record<string, unknown>).uiAmount === "number"
            ? ((tokenAmount as Record<string, unknown>).uiAmount as number)
            : 0;

        totalUiAmount += uiAmount;
      }

      return totalUiAmount;
    },

    async hasTokenAccount(walletAddress: string, mintAddress: string): Promise<boolean> {
      const response = await getTokenAccountsByOwner({
        rpcUrl,
        ownerAddress: walletAddress,
        mintAddress,
        encoding: "jsonParsed",
      });
      return response.accounts.length > 0;
    },

    async getDecimals(mintAddress: string): Promise<number> {
      const cached = decimalsCache.get(mintAddress);
      if (cached !== undefined) {
        return cached;
      }

      const response = await getTokenSupply({
        rpcUrl,
        mintAddress,
      });
      const decimals = response.decimals;
      decimalsCache.set(mintAddress, decimals);
      return decimals;
    },
  };
};
