export const HELIUS_GATEWAY_HTTP_URL = "https://beta.helius-rpc.com/?api-key=YOUR_API_KEY";
export const HELIUS_GATEWAY_WS_URL = "wss://beta.helius-rpc.com/?api-key=YOUR_API_KEY";

export const MISSING_RPC_URL_ERROR =
  "RPC URL is required. Set RPC_URL or pass rpcUrl explicitly.";

export const resolveRequiredRpcUrl = (rpcUrl?: string): string => {
  const explicitRpcUrl = rpcUrl?.trim();
  if (explicitRpcUrl) {
    return explicitRpcUrl;
  }

  const envRpcUrl = process.env.RPC_URL?.trim();
  if (envRpcUrl) {
    return envRpcUrl;
  }

  throw new Error(MISSING_RPC_URL_ERROR);
};
