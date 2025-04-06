"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.performSwap = performSwap;
const web3_js_1 = require("@solana/web3.js");
const env_1 = __importDefault(require("./config/env"));
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
async function performSwap(connection, wallet, buyTokenMint, sellTokenMint, amount, slippageBps = 500 // Default 5% slippage (increased for higher chance of success)
) {
    try {
        console.log(`Getting quote for swap: ${amount} ${sellTokenMint} -> ${buyTokenMint}`);
        // Check if we're in dev mode (using test keys)
        const isDevMode = env_1.default.PRIVATE_KEY === 'test_private_key' ||
            env_1.default.HELIUS_API_KEY === 'test_api_key';
        if (isDevMode) {
            // For development purposes, simulate the swap
            console.log(`[DEV MODE] Simulating swap: ${amount} ${sellTokenMint} -> ${buyTokenMint}`);
            // Simulate a delay to mimic real transaction processing
            await new Promise(resolve => setTimeout(resolve, 2000));
            // Mock transaction signature for development
            const mockSignature = `mock_tx_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
            console.log(`[DEV MODE] Swap simulated successfully!`);
            return mockSignature;
        }
        else {
            // For production use, perform real swap using Jupiter API with QuickNode
            console.log('Creating QuickNode connection for Jupiter swap...');
            // Create a dedicated QuickNode connection for Jupiter
            const quickNodeConnection = new web3_js_1.Connection(`https://wiser-white-diamond.solana-mainnet.quiknode.pro/${env_1.default.QUICKNODE_API_KEY}/`, 'confirmed');
            console.log('Checking wallet SOL balance...');
            const balance = await quickNodeConnection.getBalance(wallet.publicKey);
            console.log(`Wallet balance: ${balance / 1_000_000_000} SOL`);
            if (balance < amount * 1_000_000_000) {
                throw new Error(`Insufficient SOL balance for swap. Required: ${amount} SOL, Available: ${balance / 1_000_000_000} SOL`);
            }
            // Check inputs are valid PublicKeys
            try {
                new web3_js_1.PublicKey(sellTokenMint);
                new web3_js_1.PublicKey(buyTokenMint);
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                throw new Error(`Invalid token mint address: ${errorMessage}`);
            }
            console.log('Proceeding with swap using Jupiter REST API...');
            // Determine the decimals based on the token
            // SOL has 9 decimals, USDC has 6 decimals
            let decimals = 9; // Default to SOL decimals
            let tokenSymbol = 'SOL';
            // Check if this is USDC (common token in our strategies)
            if (sellTokenMint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') {
                decimals = 6;
                tokenSymbol = 'USDC';
            }
            const inputAmount = Math.floor(amount * Math.pow(10, decimals));
            console.log(`Executing swap with ${sellTokenMint} -> ${buyTokenMint}`);
            console.log(`Amount: ${inputAmount} (${amount} ${tokenSymbol})`);
            console.log(`Slippage: ${slippageBps} basis points (${slippageBps / 100}%)`);
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
            const transaction = web3_js_1.VersionedTransaction.deserialize(transactionBuffer);
            // Sign the transaction with our wallet
            transaction.sign([wallet]);
            // Step 4: Send the signed transaction
            console.log('Sending signed transaction...');
            const txSignature = await quickNodeConnection.sendTransaction(transaction, { skipPreflight: false, preflightCommitment: 'confirmed' });
            console.log(`Swap transaction sent: ${txSignature}`);
            return txSignature;
        }
    }
    catch (error) {
        console.error(`Swap failed: ${error.message || 'Unknown error'}`);
        if (error.transactionLogs) {
            console.error('Transaction logs:', error.transactionLogs.join('\n'));
        }
        throw error;
    }
}
