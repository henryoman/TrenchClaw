import { Keypair } from '@solana/web3.js';
/**
 * Parse a private key string into a Solana Keypair
 * @param privateKey - Base58 encoded string or JSON array of numbers
 * @returns Solana Keypair
 */
export declare function getKeypair(privateKey: string): Keypair;
