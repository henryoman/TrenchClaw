import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { JupiterAPI } from 'jup-api';
import env from './config/env';

/**
 * Perform a token swap using Jupiter v6
 * 
 * @param connection - Solana RPC connection
 * @param wallet - Keypair of the wallet performing the swap
 * @param buyTokenMint - Token mint address to buy
 * @param sellTokenMint - Token mint address to sell
 * @param amount - Amount to swap (in the sell token's native units)
 * @param slippageBps - Slippage tolerance in basis points (e.g., 100 = 1%)
 */
export async function performSwap(
  connection: Connection,
  wallet: Keypair,
  buyTokenMint: string,
  sellTokenMint: string,
  amount: number,
  slippageBps: number = 100 // Default 1% slippage
): Promise<string> {
  try {
    console.log(`Getting quote for swap: ${amount} ${sellTokenMint} -> ${buyTokenMint}`);
    
    // Check if we're in dev mode (using test keys)
    const isDevMode = env.PRIVATE_KEY === 'test_private_key' || 
                      env.HELIUS_API_KEY === 'test_api_key';
    
    if (isDevMode) {
      // For development purposes, simulate the swap
      console.log(`[DEV MODE] Simulating swap: ${amount} ${sellTokenMint} -> ${buyTokenMint}`);
      
      // Simulate a delay to mimic real transaction processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Mock transaction signature for development
      const mockSignature = `mock_tx_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      
      console.log(`[DEV MODE] Swap simulated successfully!`);
      return mockSignature;
    } else {
      // For production use, perform real swap using Jupiter API
      
      // Initialize Jupiter API with connection and wallet
      const jupiter = new JupiterAPI(connection, wallet);
      
      // Execute the swap directly
      const txSignature = await jupiter.executeSwap(
        sellTokenMint,                // Input mint address
        buyTokenMint,                 // Output mint address
        Math.floor(amount * 1_000_000), // Convert to decimal units (6 decimals)
        slippageBps,                  // Slippage tolerance
        wallet.publicKey              // User's public key
      );
      
      console.log(`Swap executed successfully with Jupiter!`);
      return txSignature;
    }
    
  } catch (error: any) {
    console.error(`Swap failed: ${error.message || 'Unknown error'}`);
    throw error;
  }
}