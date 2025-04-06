/**
 * Special handling for tokens with known selling restrictions
 * These tokens may require custom handling or direct use of specific DEXes
 */

// A map of token mint addresses that require special handling
export const specialTokens = new Map<string, {
  canSell: boolean; // Whether the token can be sold at all
  sellMessage: string; // User-facing message about selling this token
  altRoute?: string; // Alternative token route for selling (if available)
}>([
  // PriNtiE token - apparently has selling restrictions
  [
    'PriNtiE7V98rC4Vzvns696BFjDxwGDuC2a8qinnjEYj',
    {
      canSell: false,
      sellMessage: 'This token has selling restrictions or insufficient liquidity. It cannot be sold via Jupiter API.'
    }
  ],
  // Add more special tokens as needed
]);

/**
 * Check if a token requires special handling
 * @param tokenMint The token mint address to check
 * @returns Information about the token if it requires special handling, or null
 */
export function checkSpecialToken(tokenMint: string) {
  return specialTokens.get(tokenMint) || null;
}