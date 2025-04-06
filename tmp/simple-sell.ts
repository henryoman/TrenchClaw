import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getKeypair } from '../src/utils/keys';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: 'config/.env' });

// PriNtiE token mint address
const PRI_TOKEN_MINT = 'PriNtiE7V98rC4Vzvns696BFjDxwGDuC2a8qinnjEYj';
const SOL_TOKEN_MINT = 'So11111111111111111111111111111111111111112';

// Function to get token account balance
async function getTokenBalance(connection: Connection, wallet: Keypair, tokenMint: string): Promise<number> {
  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      wallet.publicKey,
      { mint: new PublicKey(tokenMint) }
    );
    
    if (tokenAccounts.value.length > 0) {
      const parsedAccountInfo = tokenAccounts.value[0].account.data.parsed.info;
      const decimals = parsedAccountInfo.tokenAmount.decimals;
      const rawAmount = parsedAccountInfo.tokenAmount.amount;
      
      // Convert to a human-readable number
      const tokenAmount = parseInt(rawAmount) / Math.pow(10, decimals);
      console.log(`Found ${tokenAmount} tokens of ${tokenMint}`);
      return tokenAmount;
    } else {
      console.log(`No token account found for ${tokenMint}`);
      return 0;
    }
  } catch (error) {
    console.error(`Error getting token balance: ${error instanceof Error ? error.message : String(error)}`);
    return 0;
  }
}

async function getQuote(tokenMint: string, amount: number): Promise<any> {
  try {
    // Assume token has 6 decimals (most SPL tokens do)
    const inputDecimals = 6;
    const inputAmount = Math.floor(amount * Math.pow(10, inputDecimals));
    
    // Prepare to fetch a quote
    console.log(`Getting quote for selling ${amount} of ${tokenMint} for SOL...`);
    const quoteUrl = new URL('https://quote-api.jup.ag/v6/quote');
    quoteUrl.searchParams.append('inputMint', tokenMint); // Token to sell
    quoteUrl.searchParams.append('outputMint', SOL_TOKEN_MINT); // SOL to receive
    quoteUrl.searchParams.append('amount', inputAmount.toString());
    quoteUrl.searchParams.append('slippageBps', '1000'); // 10% slippage for testing
    
    // Print the URL for debugging
    console.log(`Quote URL: ${quoteUrl.toString()}`);
    
    // Fetch quote
    const quoteResponse = await fetch(quoteUrl.toString());
    const quoteData = await quoteResponse.json();
    
    console.log("Quote response:", JSON.stringify(quoteData, null, 2));
    
    if (!quoteResponse.ok) {
      throw new Error(`Jupiter quote failed: ${JSON.stringify(quoteData)}`);
    }
    
    return quoteData;
  } catch (error) {
    console.error(`Error getting quote: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

async function sellToken() {
  try {
    console.log("Starting test sell of PriNtiE token...");
    
    // Initialize connection to Solana using Helius
    const heliusUrl = `https://rpc.helius.xyz/?api-key=${process.env.HELIUS_API_KEY}`;
    console.log("Connecting to Helius...");
    const connection = new Connection(heliusUrl);
    
    // Load wallet
    const wallet = getKeypair(process.env.PRIVATE_KEY || '');
    console.log(`Using wallet: ${wallet.publicKey.toString()}`);
    
    // Get token balance
    const tokenAmount = await getTokenBalance(connection, wallet, PRI_TOKEN_MINT);
    
    if (tokenAmount <= 0) {
      console.log("No tokens to sell. Exiting.");
      return;
    }
    
    // Use a fixed small amount for testing
    const amountToSell = Math.min(tokenAmount, 0.001);
    console.log(`Attempting to sell ${amountToSell} PriNtiE tokens...`);
    
    // Get quote
    try {
      const quoteData = await getQuote(PRI_TOKEN_MINT, amountToSell);
      console.log(`Quote received! Expected to get ${quoteData.outAmount} SOL`);
    } catch (error) {
      console.error("Failed to get quote. The token may not be sellable.");
      console.error("Try a larger amount or check if token has sufficient liquidity.");
      
      // Try with different amount
      console.log("Attempting with a different amount...");
      try {
        const largerAmount = Math.min(tokenAmount, 0.01); // Try with a larger amount
        console.log(`Trying with ${largerAmount} tokens instead...`);
        const quoteData = await getQuote(PRI_TOKEN_MINT, largerAmount);
        console.log(`Quote for larger amount received! Expected to get ${quoteData.outAmount} SOL`);
      } catch (secondError) {
        console.error("Failed with larger amount too. Token is likely not sellable.");
      }
    }
    
    console.log("Test completed.");
  } catch (error) {
    console.error(`Error in sell test: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Run the sell test
sellToken().then(() => {
  console.log("Script execution complete");
});