import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import env from './config/env';
import * as bs58 from 'bs58';

/**
 * Perform a token swap using Jupiter v6
 * 
 * @param connection - Solana RPC connection (used only for dev mode checks)
 * @param wallet - Keypair of the wallet performing the swap
 * @param buyTokenMint - Token mint address to buy
 * @param sellTokenMint - Token mint address to sell
 * @param amount - Amount to swap (in the sell token's native units)
 * @param slippageBps - Slippage tolerance in basis points (e.g., 100 = 1%)
 */
export async function performSwap(
  connection: Connection,
  wallet: Keypair,
  buyTokenMint: string,
  sellTokenMint: string,
  amount: number,
  slippageBps: number = 500 // Default 5% slippage (increased for higher chance of success)
): Promise<string> {
  try {
    console.log(`Getting quote for swap: ${amount} ${sellTokenMint} -> ${buyTokenMint}`);
    
    // Check if we're in dev mode (using test keys)
    const isDevMode = env.PRIVATE_KEY === 'test_private_key' || 
                      env.HELIUS_API_KEY === 'test_api_key';
    
    if (isDevMode) {
      // For development purposes, simulate the swap
      console.log(`[DEV MODE] Simulating swap: ${amount} ${sellTokenMint} -> ${buyTokenMint}`);
      
      // Simulate a delay to mimic real transaction processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Mock transaction signature for development
      const mockSignature = `mock_tx_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      
      console.log(`[DEV MODE] Swap simulated successfully!`);
      return mockSignature;
    } else {
      // For production use, perform real swap using Jupiter API with QuickNode
      console.log('Creating QuickNode connection for Jupiter swap...');
      
      // Create a dedicated QuickNode connection for Jupiter
      const quickNodeConnection = new Connection(
        `https://wiser-white-diamond.solana-mainnet.quiknode.pro/${env.QUICKNODE_API_KEY}/`,
        'confirmed'
      );
      
      console.log('Checking wallet SOL balance...');
      const balance = await quickNodeConnection.getBalance(wallet.publicKey);
      console.log(`Wallet balance: ${balance / 1_000_000_000} SOL`);
      
      if (balance < amount * 1_000_000_000) {
        throw new Error(`Insufficient SOL balance for swap. Required: ${amount} SOL, Available: ${balance / 1_000_000_000} SOL`);
      }
      
      // Check inputs are valid PublicKeys
      try {
        new PublicKey(sellTokenMint);
        new PublicKey(buyTokenMint);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid token mint address: ${errorMessage}`);
      }
      
      console.log('Proceeding with swap using Jupiter REST API...');
      
      // SOL has 9 decimals
      const inputAmount = Math.floor(amount * 1_000_000_000); // Convert to lamports
      
      console.log(`Executing swap with ${sellTokenMint} -> ${buyTokenMint}`);
      console.log(`Amount: ${inputAmount} lamports (${amount} SOL)`);
      console.log(`Slippage: ${slippageBps} basis points (${slippageBps/100}%)`);
      
      // Step 1: Get a quote from Jupiter's REST API
      console.log('Getting quote from Jupiter REST API...');
      const quoteUrl = new URL('https://quote-api.jup.ag/v6/quote');
      quoteUrl.searchParams.append('inputMint', sellTokenMint);
      quoteUrl.searchParams.append('outputMint', buyTokenMint);
      quoteUrl.searchParams.append('amount', inputAmount.toString());
      quoteUrl.searchParams.append('slippageBps', slippageBps.toString());
      
      const quoteResponse = await fetch(quoteUrl.toString());
      const quoteData = await quoteResponse.json();
      
      if (!quoteResponse.ok) {
        throw new Error(`Jupiter quote failed: ${JSON.stringify(quoteData)}`);
      }
      
      console.log(`Quote received: In=${quoteData.inputAmount}, Out=${quoteData.outputAmount}`);
      console.log(`Price impact: ${quoteData.priceImpactPct}%`);
      
      // Step 2: Get a serialized transaction
      console.log('Getting serialized transaction...');
      const transactionResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quoteData,
          userPublicKey: wallet.publicKey.toString(),
          wrapAndUnwrapSol: true, // Automatically wrap and unwrap SOL
          prioritizationFeeLamports: 5000 // Add priority fee (0.000005 SOL)
        })
      });
      
      const transactionData = await transactionResponse.json();
      
      if (!transactionResponse.ok) {
        throw new Error(`Failed to get transaction: ${JSON.stringify(transactionData)}`);
      }
      
      // Step 3: Deserialize and sign the transaction
      console.log('Deserializing and signing transaction...');
      const serializedTransaction = transactionData.swapTransaction;
      
      // Create a buffer from the serialized transaction
      const transactionBuffer = Buffer.from(serializedTransaction, 'base64');
      
      // Deserialize as a versioned transaction
      const transaction = VersionedTransaction.deserialize(transactionBuffer);
      
      // Sign the transaction with our wallet
      transaction.sign([wallet]);
      
      // Step 4: Send the signed transaction
      console.log('Sending signed transaction...');
      const txSignature = await quickNodeConnection.sendTransaction(
        transaction,
        { skipPreflight: false, preflightCommitment: 'confirmed' }
      );
      
      console.log(`Swap transaction sent: ${txSignature}`);
      return txSignature;
    }
    
  } catch (error: any) {
    console.error(`Swap failed: ${error.message || 'Unknown error'}`);
    if (error.transactionLogs) {
      console.error('Transaction logs:', error.transactionLogs.join('\n'));
    }
    throw error;
  }
}