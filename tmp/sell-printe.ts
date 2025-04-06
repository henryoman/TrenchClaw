import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import * as bs58 from 'bs58';
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

async function sellToken() {
  try {
    console.log("Starting test sell of PriNtiE token...");
    
    // Initialize connection to Solana
    const quicknodeUrl = `https://api.quicknode.com/v1/${process.env.QUICKNODE_API_KEY}`;
    console.log("Connecting to QuickNode...");
    const connection = new Connection(quicknodeUrl);
    
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
    
    // Calculate the input amount in token's native units
    // Assuming PriNtiE has 6 decimals (most SPL tokens do)
    const inputDecimals = 6;
    const inputAmount = Math.floor(amountToSell * Math.pow(10, inputDecimals));
    
    // Prepare to fetch a quote
    console.log("Getting quote...");
    const quoteUrl = new URL('https://quote-api.jup.ag/v6/quote');
    quoteUrl.searchParams.append('inputMint', PRI_TOKEN_MINT);
    quoteUrl.searchParams.append('outputMint', SOL_TOKEN_MINT);
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
    
    console.log(`Got quote! In: ${quoteData.inputAmount}, Out: ${quoteData.outputAmount}`);
    
    // Get serialized transactions
    console.log("Getting serialized transaction...");
    const swapUrl = new URL('https://quote-api.jup.ag/v6/swap');
    const swapRequestBody = {
      quoteResponse: quoteData,
      userPublicKey: wallet.publicKey.toString(),
      wrapAndUnwrapSol: true, // Handle wrapping/unwrapping of SOL
    };
    
    const swapResponse = await fetch(swapUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(swapRequestBody),
    });
    
    const swapData = await swapResponse.json();
    console.log("Swap response:", JSON.stringify(swapData, null, 2));
    
    if (!swapResponse.ok) {
      throw new Error(`Jupiter swap request failed: ${JSON.stringify(swapData)}`);
    }
    
    // If using a legacy transaction (base64 encoded)
    if (swapData.swapTransaction) {
      const swapTransactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
      const transaction = Transaction.from(swapTransactionBuf);
      
      // Sign and send the transaction
      transaction.partialSign(wallet);
      const serializedTransaction = transaction.serialize();
      
      const txid = await connection.sendRawTransaction(serializedTransaction, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
      
      console.log(`Sell transaction sent! Signature: ${txid}`);
    } else if (swapData.encodedTransaction) {
      // If using a versioned transaction (base64 encoded)
      const serializedTransaction = Buffer.from(swapData.encodedTransaction, 'base64');
      // We don't actually need this line for signing
      // const signature = bs58.encode(wallet.secretKey.slice(0, 64));
      
      const recoverTx = VersionedTransaction.deserialize(serializedTransaction);
      recoverTx.sign([wallet]);
      
      const txid = await connection.sendTransaction(recoverTx, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
      
      console.log(`Sell transaction sent! Signature: ${txid}`);
    } else {
      throw new Error("No transaction found in the response");
    }
    
    console.log("Sell test completed!");
  } catch (error) {
    console.error(`Error in sell test: ${error instanceof Error ? error.message : String(error)}`);
    console.error(error);
  }
}

// Run the sell test
sellToken().then(() => {
  console.log("Script execution complete");
});