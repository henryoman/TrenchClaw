import { Connection } from '@solana/web3.js';
import env from './config/env';
import { getKeypair } from './utils/keys';
import { runDCA } from './dca';

/**
 * Main function to initialize and start the DCA bot
 */
async function main(): Promise<void> {
  try {
    console.log('Initializing DCA bot...');
    
    // Create Solana RPC connection with Helius endpoint
    const connection = new Connection(
      `https://rpc.helius.xyz/?api-key=${env.HELIUS_API_KEY}`,
      'confirmed'
    );
    
    // Get wallet keypair from private key
    const wallet = getKeypair(env.PRIVATE_KEY);
    console.log(`Wallet public key: ${wallet.publicKey.toString()}`);
    
    // Log connection info
    console.log('Connection established to Solana network');
    console.log('QuickNode API Key loaded for metrics:', env.QUICKNODE_API_KEY ? 'Yes' : 'No');
    
    // Start the DCA bot
    await runDCA(connection, wallet);
    
  } catch (error: any) {
    console.error('Bot failed to start:', error.message);
    process.exit(1);
  }
}

// Run the main function
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});