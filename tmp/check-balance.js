const { Connection, PublicKey } = require('@solana/web3.js');
const { getKeypair } = require('../dist/utils/keys');
require('dotenv').config({ path: './config/.env' });

async function checkBalance() {
  try {
    // Get private key from environment
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      console.error('PRIVATE_KEY not found in environment');
      return;
    }
    
    // Get wallet keypair
    const wallet = getKeypair(privateKey);
    const publicKey = wallet.publicKey.toString();
    
    // Connect to Helius
    const heliusKey = process.env.HELIUS_API_KEY;
    if (!heliusKey) {
      console.error('HELIUS_API_KEY not found in environment');
      return;
    }
    
    const connection = new Connection(
      `https://rpc.helius.xyz/?api-key=${heliusKey}`,
      'confirmed'
    );
    
    console.log(`Wallet public key: ${publicKey}`);
    const balance = await connection.getBalance(wallet.publicKey);
    console.log(`SOL Balance: ${balance / 1_000_000_000} SOL`);
  } catch (error) {
    console.error('Error checking balance:', error);
  }
}

checkBalance();
