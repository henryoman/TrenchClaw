"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.performSwap = performSwap;
const web3_js_1 = require("@solana/web3.js");
const jup_api_1 = require("jup-api");
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
async function performSwap(connection, wallet, buyTokenMint, sellTokenMint, amount, slippageBps = 100 // Default 1% slippage
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
            // Initialize Jupiter API with QuickNode connection and wallet
            const jupiter = new jup_api_1.JupiterAPI(quickNodeConnection, wallet);
            console.log('Executing swap via Jupiter with QuickNode connection...');
            // Execute the swap directly
            const txSignature = await jupiter.executeSwap(sellTokenMint, // Input mint address
            buyTokenMint, // Output mint address
            Math.floor(amount * 1_000_000), // Convert to decimal units (6 decimals)
            slippageBps, // Slippage tolerance
            wallet.publicKey // User's public key
            );
            console.log(`Swap executed successfully with Jupiter!`);
            return txSignature;
        }
    }
    catch (error) {
        console.error(`Swap failed: ${error.message || 'Unknown error'}`);
        throw error;
    }
}
