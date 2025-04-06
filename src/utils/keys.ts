import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

/**
 * Parse a private key string into a Solana Keypair
 * @param privateKey - Base58 encoded string or JSON array of numbers
 * @returns Solana Keypair
 */
export function getKeypair(privateKey: string): Keypair {
  try {
    try {
      // First try parsing as a JSON array of numbers
      if (privateKey.startsWith('[') && privateKey.endsWith(']')) {
        const secretKeyArray = JSON.parse(privateKey);
        
        if (Array.isArray(secretKeyArray) && secretKeyArray.length === 64) {
          return Keypair.fromSecretKey(Uint8Array.from(secretKeyArray));
        }
      }
      
      // If it's not a valid JSON array, treat as a base58 encoded key
      try {
        const decodedKey = bs58.decode(privateKey);
        return Keypair.fromSecretKey(decodedKey);
      } catch (e) {
        // For development/testing, generate a new random keypair
        if (privateKey === 'test_private_key') {
          console.log('[DEV MODE] Using randomly generated keypair for testing');
          return Keypair.generate();
        }
        throw e;
      }
    } catch (parseError) {
      // For development/testing, generate a new random keypair
      if (privateKey === 'test_private_key') {
        console.log('[DEV MODE] Using randomly generated keypair for testing');
        return Keypair.generate();
      }
      throw parseError;
    }
  } catch (error: any) {
    throw new Error(`Failed to parse private key: ${error.message || 'Unknown error'}`);
  }
}