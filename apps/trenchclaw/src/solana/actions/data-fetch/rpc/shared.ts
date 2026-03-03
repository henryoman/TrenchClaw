const heliusApiKey = process.env.HELIUS_API_KEY?.trim();

export const DEFAULT_SOLANA_MAINNET_RPC_URL = heliusApiKey
  ? `https://beta.helius-rpc.com/?api-key=${heliusApiKey}`
  : "https://api.mainnet-beta.solana.com";
