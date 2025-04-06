import { Connection } from '@solana/web3.js';
import env from './config/env';
import { getKeypair } from './utils/keys';
import { runDCA } from './dca';
import { runSwing } from './swing';
import { runPercentageTrading } from './percentage-trading';
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
    
    // Check which strategy config files exist
    const configPath = process.cwd();
    const hasDcaStrategies = fs.existsSync(path.resolve(configPath, 'config', 'strategies.json'));
    const hasSwingStrategies = fs.existsSync(path.resolve(configPath, 'config', 'swing-strategies.json'));
    const hasPercentageStrategies = fs.existsSync(path.resolve(configPath, 'config', 'percentage-strategies.json'));
    
    let strategiesFound = false;
    
    // Start the bots based on available strategies
    if (hasDcaStrategies) {
      console.log('Starting DCA bot...');
      await runDCA(connection, wallet);
      strategiesFound = true;
    }
    
    if (hasSwingStrategies) {
      console.log('Starting swing trading bot...');
      await runSwing(connection, wallet);
      strategiesFound = true;
    }

    if (hasPercentageStrategies) {
      console.log('Starting percentage-based trading bot...');
      await runPercentageTrading(connection, wallet);
      strategiesFound = true;
    }
    
    if (!strategiesFound) {
      console.log('No trading strategies found. Please create at least one of:');
      console.log('- config/strategies.json (DCA strategies)');
      console.log('- config/swing-strategies.json (Swing trading strategies)');
      console.log('- config/percentage-strategies.json (Percentage-based trading strategies)');
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