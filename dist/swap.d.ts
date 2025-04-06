import { Connection, Keypair } from '@solana/web3.js';
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
export declare function performSwap(connection: Connection, wallet: Keypair, buyTokenMint: string, sellTokenMint: string, amount: number, slippageBps?: number): Promise<string>;
