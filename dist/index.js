"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const env_1 = __importDefault(require("./config/env"));
const keys_1 = require("./utils/keys");
const dca_1 = require("./dca");
const swing_1 = require("./swing");
const percentage_trading_1 = require("./percentage-trading");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/**
 * Main function to initialize and start the trading bots
 */
async function main() {
    try {
        console.log('Initializing trading bots...');
        // Create Solana RPC connection with Helius endpoint
        const connection = new web3_js_1.Connection(`https://rpc.helius.xyz/?api-key=${env_1.default.HELIUS_API_KEY}`, 'confirmed');
        // Get wallet keypair from private key
        const wallet = (0, keys_1.getKeypair)(env_1.default.PRIVATE_KEY);
        console.log(`Wallet public key: ${wallet.publicKey.toString()}`);
        // Log connection info
        console.log('Connection established to Solana network via Helius');
        console.log('Helius API Key loaded:', env_1.default.HELIUS_API_KEY ? 'Yes' : 'No');
        console.log('QuickNode API Key loaded:', env_1.default.QUICKNODE_API_KEY ? 'Yes' : 'No');
        // Check which strategy config files exist
        const configPath = process.cwd();
        const hasDcaStrategies = fs_1.default.existsSync(path_1.default.resolve(configPath, 'config', 'strategies.json'));
        const hasSwingStrategies = fs_1.default.existsSync(path_1.default.resolve(configPath, 'config', 'swing-strategies.json'));
        const hasPercentageStrategies = fs_1.default.existsSync(path_1.default.resolve(configPath, 'config', 'percentage-strategies.json'));
        let strategiesFound = false;
        // Start the bots based on available strategies
        if (hasDcaStrategies) {
            console.log('Starting DCA bot...');
            await (0, dca_1.runDCA)(connection, wallet);
            strategiesFound = true;
        }
        if (hasSwingStrategies) {
            console.log('Starting swing trading bot...');
            await (0, swing_1.runSwing)(connection, wallet);
            strategiesFound = true;
        }
        if (hasPercentageStrategies) {
            console.log('Starting percentage-based trading bot...');
            await (0, percentage_trading_1.runPercentageTrading)(connection, wallet);
            strategiesFound = true;
        }
        if (!strategiesFound) {
            console.log('No trading strategies found. Please create at least one of:');
            console.log('- config/strategies.json (DCA strategies)');
            console.log('- config/swing-strategies.json (Swing trading strategies)');
            console.log('- config/percentage-strategies.json (Percentage-based trading strategies)');
        }
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
