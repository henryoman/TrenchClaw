import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getKeypair } from '../src/utils/keys';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: 'config/.env' });

// PriNtiE token mint address
const PRI_TOKEN_MINT = 'PriNtiE7V98rC4Vzvns696BFjDxwGDuC2a8qinnjEYj';
const SOL_TOKEN_MINT = 'So11111111111111111111111111111111111111112';
const USDC_TOKEN_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

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

async function getQuoteForPair(inputMint: string, outputMint: string, amount: number, decimals: number = 6): Promise<any> {
  try {
    const inputAmount = Math.floor(amount * Math.pow(10, decimals));
    
    console.log(`Getting quote for swapping ${amount} of ${inputMint} to ${outputMint}...`);
    const quoteUrl = new URL('https://quote-api.jup.ag/v6/quote');
    quoteUrl.searchParams.append('inputMint', inputMint);
    quoteUrl.searchParams.append('outputMint', outputMint);
    quoteUrl.searchParams.append('amount', inputAmount.toString());
    quoteUrl.searchParams.append('slippageBps', '1000'); // 10% slippage for testing
    quoteUrl.searchParams.append('onlyDirectRoutes', 'false'); // Allow multi-hop routes
    
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

async function testRoutes() {
  try {
    console.log("Starting route testing for PriNtiE token...");
    
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
      console.log("No tokens to test routes for. Exiting.");
      return;
    }
    
    // Test amount
    const testAmount = Math.min(tokenAmount, 100); // Try with a larger amount for testing
    console.log(`Testing routes for ${testAmount} PriNtiE tokens...`);
    
    // Test various trading pairs
    console.log("\n=== TESTING DIRECT ROUTE TO SOL ===");
    try {
      await getQuoteForPair(PRI_TOKEN_MINT, SOL_TOKEN_MINT, testAmount);
      console.log("✅ Direct route to SOL exists");
    } catch (error) {
      console.log("❌ No direct route to SOL");
    }
    
    console.log("\n=== TESTING ROUTE TO USDC ===");
    try {
      await getQuoteForPair(PRI_TOKEN_MINT, USDC_TOKEN_MINT, testAmount);
      console.log("✅ Route to USDC exists");
    } catch (error) {
      console.log("❌ No route to USDC");
    }
    
    // Test with smaller amount
    const smallAmount = 0.001;
    console.log(`\n=== TESTING WITH SMALLER AMOUNT (${smallAmount}) ===`);
    try {
      await getQuoteForPair(PRI_TOKEN_MINT, SOL_TOKEN_MINT, smallAmount);
      console.log("✅ Route with small amount exists");
    } catch (error) {
      console.log("❌ No route with small amount");
    }
    
    // Test other common trading pairs as intermediaries
    const commonTokens = [
      { name: "USDT", mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" },
      { name: "BONKs", mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
      { name: "ORCA", mint: "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE" },
      { name: "SAMO", mint: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" }
    ];
    
    for (const token of commonTokens) {
      console.log(`\n=== TESTING ROUTE TO ${token.name} ===`);
      try {
        await getQuoteForPair(PRI_TOKEN_MINT, token.mint, testAmount);
        console.log(`✅ Route to ${token.name} exists`);
        
        // If route exists, check if we can then go to SOL
        console.log(`\n=== TESTING ${token.name} TO SOL (second leg) ===`);
        try {
          await getQuoteForPair(token.mint, SOL_TOKEN_MINT, 1);  // Test with a small amount
          console.log(`✅ Route from ${token.name} to SOL exists (potential two-step path)`);
        } catch (error) {
          console.log(`❌ No route from ${token.name} to SOL`);
        }
      } catch (error) {
        console.log(`❌ No route to ${token.name}`);
      }
    }
    
    console.log("\nRoute testing completed.");
  } catch (error) {
    console.error(`Error in route testing: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Run the route tests
testRoutes().then(() => {
  console.log("Script execution complete");
});