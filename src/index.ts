import { Connection } from '@solana/web3.js';
import env from './config/env';
import { getKeypair } from './utils/keys';
import { runDCA } from './dca';
import { runSwing } from './swing';
import fs from 'fs';
import path from 'path';

/**
 * Main function to initialize and start the trading bots
 */
async function main(): Promise<void> {
  try {
    console.log('Initializing trading bots...');
    
    // Create Solana RPC connection with Helius endpoint
    const connection = new Connection(
      `https://rpc.helius.xyz/?api-key=${env.HELIUS_API_KEY}`,
      'confirmed'
    );
    
    // Get wallet keypair from private key
    const wallet = getKeypair(env.PRIVATE_KEY);
    console.log(`Wallet public key: ${wallet.publicKey.toString()}`);
    
    // Log connection info
    console.log('Connection established to Solana network via Helius');
    console.log('Helius API Key loaded:', env.HELIUS_API_KEY ? 'Yes' : 'No');
    console.log('QuickNode API Key loaded:', env.QUICKNODE_API_KEY ? 'Yes' : 'No');
    
    // Check if swing-strategies.json exists
    const swingStratPath = path.resolve(process.cwd(), 'config', 'swing-strategies.json');
    const hasDcaStrategies = fs.existsSync(path.resolve(process.cwd(), 'config', 'strategies.json'));
    const hasSwingStrategies = fs.existsSync(swingStratPath);
    
    // Start the bots based on available strategies
    if (hasDcaStrategies) {
      console.log('Starting DCA bot...');
      await runDCA(connection, wallet);
    }
    
    if (hasSwingStrategies) {
      console.log('Starting swing trading bot...');
      await runSwing(connection, wallet);
    }
    
    if (!hasDcaStrategies && !hasSwingStrategies) {
      console.log('No trading strategies found. Please create either strategies.json or swing-strategies.json');
    }
    
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