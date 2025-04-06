import { Connection, Keypair, PublicKey } from '@solana/web3.js';

// Map of special token mint addresses to specific handling information
export const specialTokens = new Map<string, {
  name: string;
  minAmount?: number;  // Minimum amount required for selling (if applicable)
  unsellable?: boolean;  // If true, token can't be sold back to SOL directly
}>();

// Add special token handling here
specialTokens.set('PriNtiE7V98rC4Vzvns696BFjDxwGDuC2a8qinnjEYj', {
  name: 'PriNtiE',
  minAmount: 100,  // Minimum amount needed to sell
});

/**
 * Check if a token requires special handling
 * @param tokenMint The token mint address to check
 * @returns Information about the token if it requires special handling, or null
 */
export function checkSpecialToken(tokenMint: string) {
  return specialTokens.get(tokenMint) || null;
}

/**
 * Get actual token balance for a specific token
 * @param connection Solana RPC connection
 * @param wallet Wallet keypair
 * @param tokenMint Token mint address to check
 * @returns The token balance as a number, or 0 if no balance found
 */
export async function getActualTokenBalance(
  connection: Connection, 
  wallet: Keypair, 
  tokenMint: string
): Promise<number> {
  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      wallet.publicKey,
      { mint: new PublicKey(tokenMint) }
    );
    
    if (tokenAccounts.value.length === 0) {
      console.log(`No token account found for ${tokenMint}`);
      return 0;
    }
    
    const parsedAccountInfo = tokenAccounts.value[0].account.data.parsed.info;
    const decimals = parsedAccountInfo.tokenAmount.decimals;
    const rawAmount = parsedAccountInfo.tokenAmount.amount;
    
    // Convert to a human-readable number
    const tokenAmount = parseInt(rawAmount) / Math.pow(10, decimals);
    console.log(`Found ${tokenAmount} tokens of ${tokenMint}`);
    return tokenAmount;
  } catch (error) {
    console.error(`Error getting token balance: ${error instanceof Error ? error.message : String(error)}`);
    return 0;
  }
}