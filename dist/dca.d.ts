import { Connection, Keypair } from '@solana/web3.js';
/**
 * Run the DCA bot for all configured strategies
 *
 * @param connection - Solana RPC connection
 * @param wallet - Keypair of the wallet performing the swaps
 */
export declare function runDCA(connection: Connection, wallet: Keypair): Promise<void>;
