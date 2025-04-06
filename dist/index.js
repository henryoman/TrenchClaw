"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const env_1 = __importDefault(require("./config/env"));
const keys_1 = require("./utils/keys");
const dca_1 = require("./dca");
/**
 * Main function to initialize and start the DCA bot
 */
async function main() {
    try {
        console.log('Initializing DCA bot...');
        // Create Solana RPC connection with QuickNode endpoint
        const connection = new web3_js_1.Connection(`https://wiser-white-diamond.solana-mainnet.quiknode.pro/${env_1.default.QUICKNODE_API_KEY}/`, 'confirmed');
        // Get wallet keypair from private key
        const wallet = (0, keys_1.getKeypair)(env_1.default.PRIVATE_KEY);
        console.log(`Wallet public key: ${wallet.publicKey.toString()}`);
        // Log connection info
        console.log('Connection established to Solana network via QuickNode');
        console.log('QuickNode API Key loaded:', env_1.default.QUICKNODE_API_KEY ? 'Yes' : 'No');
        // Start the DCA bot
        await (0, dca_1.runDCA)(connection, wallet);
    }
    catch (error) {
        console.error('Bot failed to start:', error.message);
        process.exit(1);
    }
}
// Run the main function
main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
});
