import { Connection, Keypair } from '@solana/web3.js';
/**
 * Run the swing trading bot for all configured strategies
 *
 * @param connection - Solana RPC connection
 * @param wallet - Keypair of the wallet performing the swaps
 */
export declare function runSwing(connection: Connection, wallet: Keypair): Promise<void>;
