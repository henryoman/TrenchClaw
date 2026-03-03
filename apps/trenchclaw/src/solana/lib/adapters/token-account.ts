import { address, createSolanaRpc } from "@solana/kit";

const heliusApiKey = process.env.HELIUS_API_KEY?.trim();
const DEFAULT_SOLANA_MAINNET_RPC_URL = heliusApiKey
  ? `https://beta.helius-rpc.com/?api-key=${heliusApiKey}`
  : "https://api.mainnet-beta.solana.com";
const LAMPORTS_PER_SOL = 1_000_000_000;

export interface TokenAccountAdapterConfig {
  rpcUrl?: string;
}

export interface TokenAccountAdapter {
  getSolBalance(walletAddress: string): Promise<number>;
  getTokenBalance(walletAddress: string, mintAddress: string): Promise<number>;
  getDecimals(mintAddress: string): Promise<number>;
}

export const createTokenAccountAdapter = (
  config: TokenAccountAdapterConfig = {},
): TokenAccountAdapter => {
  const rpcUrl = config.rpcUrl ?? process.env.RPC_URL ?? DEFAULT_SOLANA_MAINNET_RPC_URL;
  const rpc = createSolanaRpc(rpcUrl);
  const decimalsCache = new Map<string, number>();

  return {
    async getSolBalance(walletAddress: string): Promise<number> {
      const response = await rpc.getBalance(address(walletAddress)).send();
      return Number(response.value) / LAMPORTS_PER_SOL;
    },

    async getTokenBalance(walletAddress: string, mintAddress: string): Promise<number> {
      const response = await (rpc as any)
        .getTokenAccountsByOwner(
          address(walletAddress),
          {
            mint: address(mintAddress),
          },
          {
            encoding: "jsonParsed",
          },
        )
        .send();

      const entries: unknown[] = Array.isArray(response?.value) ? response.value : [];
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

    async getDecimals(mintAddress: string): Promise<number> {
      const cached = decimalsCache.get(mintAddress);
      if (cached !== undefined) {
        return cached;
      }

      const response = await (rpc as any).getTokenSupply(address(mintAddress)).send();
      const decimalsRaw = response?.value?.decimals;
      const decimals = typeof decimalsRaw === "number" ? decimalsRaw : 0;
      decimalsCache.set(mintAddress, decimals);
      return decimals;
    },
  };
};

export const createTokenAccountAdapterFromEnv = (): TokenAccountAdapter =>
  createTokenAccountAdapter({ rpcUrl: process.env.RPC_URL });
