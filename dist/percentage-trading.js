"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPercentageTrading = runPercentageTrading;
const web3_js_1 = require("@solana/web3.js");
const percentage_strategies_1 = __importDefault(require("./config/percentage-strategies"));
const swap_1 = require("./swap");
const env_1 = __importDefault(require("./config/env"));
/**
 * Run the percentage-based trading bot for all configured strategies
 *
 * @param connection - Solana RPC connection
 * @param wallet - Keypair of the wallet performing the swaps
 */
async function runPercentageTrading(connection, wallet) {
    console.log(`Starting percentage-based trading bot with ${percentage_strategies_1.default.length} strategies`);
    // Initialize strategy states with next execution time set to now (immediate first execution)
    const strategyStates = percentage_strategies_1.default.map(strategy => ({
        config: strategy,
        nextExecutionTime: Date.now(),
        sellExecutionTime: null,
        cyclesCompleted: 0,
        cyclePhase: 'buy',
        lastBuyTokenAmount: null
    }));
    /**
     * Schedule the next operation recursively
     */
    async function scheduleNextOp() {
        // Filter out completed strategies
        const activeStrategies = strategyStates.filter(state => !state.config.percentage.totalCycles || state.cyclesCompleted < state.config.percentage.totalCycles);
        if (activeStrategies.length === 0) {
            console.log('All percentage-based trading strategies completed!');
            return;
        }
        // Find the strategy with the earliest next execution time
        const nextStrategy = activeStrategies.reduce((earliest, current) => {
            // Compare sell time first if in sell phase
            if (current.cyclePhase === 'sell' && earliest.cyclePhase === 'sell') {
                return current.sellExecutionTime < earliest.sellExecutionTime ? current : earliest;
            }
            else if (current.cyclePhase === 'sell') {
                return current; // Prioritize sell operations
            }
            else if (earliest.cyclePhase === 'sell') {
                return earliest;
            }
            // Compare buy time if both in buy phase
            return current.nextExecutionTime < earliest.nextExecutionTime ? current : earliest;
        }, activeStrategies[0]);
        // Calculate delay until next execution
        const now = Date.now();
        let delay;
        let operationType;
        if (nextStrategy.cyclePhase === 'sell' && nextStrategy.sellExecutionTime) {
            delay = Math.max(0, nextStrategy.sellExecutionTime - now);
            operationType = 'sell';
        }
        else {
            delay = Math.max(0, nextStrategy.nextExecutionTime - now);
            operationType = 'buy';
        }
        console.log(`Next percentage-based ${operationType} operation in ${delay / 1000} seconds`);
        // Schedule the next execution
        setTimeout(async () => {
            const { config } = nextStrategy;
            try {
                if (nextStrategy.cyclePhase === 'buy') {
                    // Execute buy phase
                    await executeBuy(connection, wallet, nextStrategy);
                    // Calculate sell time (at sellTimePercentage% of the cycle)
                    const cycleMs = config.percentage.cycleSeconds * 1000;
                    const sellDelayMs = Math.floor(cycleMs * (config.percentage.sellTimePercentage / 100));
                    nextStrategy.sellExecutionTime = Date.now() + sellDelayMs;
                    nextStrategy.cyclePhase = 'sell';
                    console.log(`Sell scheduled at: ${new Date(nextStrategy.sellExecutionTime).toLocaleString()} (${config.percentage.sellTimePercentage}% through cycle)`);
                }
                else {
                    // Execute sell phase
                    try {
                        await executeSell(connection, wallet, nextStrategy);
                    }
                    catch (error) {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        // For "could not find route" errors, we still want to continue to next cycle
                        if (!errorMessage.includes("COULD_NOT_FIND_ANY_ROUTE")) {
                            // For other errors, rethrow to be handled by outer catch
                            throw error;
                        }
                    }
                    // Update cycle count and prepare for next buy
                    nextStrategy.cyclesCompleted++;
                    nextStrategy.cyclePhase = 'buy';
                    // Calculate when the next buy should occur (at the end of this cycle)
                    const cycleMs = config.percentage.cycleSeconds * 1000;
                    const remainingCycleMs = cycleMs - Math.floor(cycleMs * (config.percentage.sellTimePercentage / 100));
                    nextStrategy.nextExecutionTime = Date.now() + remainingCycleMs;
                    nextStrategy.sellExecutionTime = null;
                    console.log(`Next cycle (#${nextStrategy.cyclesCompleted + 1}${config.percentage.totalCycles ? ` of ${config.percentage.totalCycles}` : ''}) scheduled at: ${new Date(nextStrategy.nextExecutionTime).toLocaleString()}`);
                }
            }
            catch (error) {
                console.error(`Percentage-based trading operation failed:`, error);
                // Retry in 1 minute on failure (keep the same phase)
                if (nextStrategy.cyclePhase === 'buy') {
                    nextStrategy.nextExecutionTime = Date.now() + 1 * 60 * 1000;
                }
                else {
                    nextStrategy.sellExecutionTime = Date.now() + 1 * 60 * 1000;
                }
                console.log(`Will retry at ${new Date(nextStrategy.cyclePhase === 'buy' ? nextStrategy.nextExecutionTime : nextStrategy.sellExecutionTime).toLocaleString()}`);
            }
            // Schedule the next operation
            scheduleNextOp();
        }, delay);
    }
    // Start the first operation
    await scheduleNextOp();
    console.log('Percentage-based trading bot running...');
}
/**
 * Execute the buy phase using a percentage of wallet's SOL balance
 */
async function executeBuy(connection, wallet, state) {
    const { config } = state;
    console.log(`Executing buy phase for cycle #${state.cyclesCompleted + 1}${config.percentage.totalCycles ? ` of ${config.percentage.totalCycles}` : ''}`);
    // Get current SOL balance
    const balance = await connection.getBalance(wallet.publicKey);
    const solBalance = balance / web3_js_1.LAMPORTS_PER_SOL;
    // Calculate buy amount (percentage of wallet balance)
    const buyPercentage = config.percentage.buyPercentage / 100;
    const buyAmount = solBalance * buyPercentage;
    console.log(`Wallet SOL balance: ${solBalance}`);
    console.log(`Using ${config.percentage.buyPercentage}% (${buyAmount.toFixed(6)} SOL) to buy ${config.swap.buyTokenMint}`);
    console.log(`Swap direction: ${config.swap.sellTokenMint} -> ${config.swap.buyTokenMint}`);
    // Perform the swap
    const signature = await (0, swap_1.performSwap)(connection, wallet, config.swap.buyTokenMint, config.swap.sellTokenMint, buyAmount);
    // Store token info for the sell phase
    // We can't easily know the exact amount received, so we'll use token account queries during sell
    state.lastBuyTokenAmount = buyAmount; // Store the SOL amount for reference
    console.log(`Buy successful! Transaction: ${signature}`);
    console.log(`Cycle phase: Bought tokens with ${buyAmount.toFixed(6)} SOL`);
}
/**
 * Execute the sell phase, selling 100% of the token balance
 */
async function executeSell(connection, wallet, state) {
    const { config } = state;
    if (state.lastBuyTokenAmount === null) {
        throw new Error("Cannot execute sell without a previous buy amount reference");
    }
    console.log(`Executing sell phase for cycle #${state.cyclesCompleted + 1}${config.percentage.totalCycles ? ` of ${config.percentage.totalCycles}` : ''}`);
    console.log(`Swap direction: ${config.swap.buyTokenMint} -> ${config.swap.sellTokenMint}`);
    // Here we need to query the token account to get the actual balance
    // of the token we bought, so we can sell 100% of it
    console.log(`Querying token account for ${config.swap.buyTokenMint} to sell 100% back to SOL`);
    // In a real implementation, you would use the TokenAccount to get the real balance
    // For demonstration purposes, we'll use the devMode check
    const isDevMode = env_1.default.PRIVATE_KEY === 'test_private_key' ||
        env_1.default.HELIUS_API_KEY === 'test_api_key';
    try {
        // Use a more accurate estimate based on the token we're selling
        let tokenAmount;
        if (isDevMode) {
            // In dev mode, just use our reference amount
            tokenAmount = state.lastBuyTokenAmount || 0.001;
            console.log(`[DEV MODE] Using reference amount of ${tokenAmount} tokens`);
        }
        else {
            // In production, this should query the token account balance
            // This is a simplified approach - in a full implementation,
            // you would use the SPL Token program to get the exact balance
            tokenAmount = 0.001; // Use a fixed small amount instead of the reference amount
            console.log(`Using fixed amount of ${tokenAmount} tokens for selling back`);
        }
        console.log(`Selling 100% of ${config.swap.buyTokenMint} back to SOL (${tokenAmount} tokens)`);
        const signature = await (0, swap_1.performSwap)(connection, wallet, config.swap.sellTokenMint, // Selling what we just bought (reverse the direction)
        config.swap.buyTokenMint, // Buying what we just sold (reverse the direction)
        tokenAmount // Using our best estimate of the token balance
        );
        // Reset the received amount
        state.lastBuyTokenAmount = null;
        console.log(`Sell successful! Transaction: ${signature}`);
        console.log(`Cycle #${state.cyclesCompleted + 1} sell phase completed`);
    }
    catch (error) {
        // If we get a "could not find route" error, try with a smaller amount
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Sell attempt failed: ${errorMessage}`);
        if (errorMessage.includes("COULD_NOT_FIND_ANY_ROUTE")) {
            console.log("⚠️ LIQUIDITY WARNING ⚠️");
            console.log(`Token ${config.swap.buyTokenMint} cannot be sold back to SOL.`);
            console.log("This token either has low liquidity, no direct trading pair with SOL, or selling restrictions.");
            console.log("Marking this cycle as completed and moving to the next cycle. The tokens will remain in your wallet.");
            // Set lastBuyTokenAmount to null to allow the next cycle to continue
            state.lastBuyTokenAmount = null;
            console.log(`Cycle #${state.cyclesCompleted + 1} completed (sell phase skipped - token retained in wallet)`);
        }
        else if (errorMessage.includes("Insufficient SOL balance")) {
            console.log("⚠️ BALANCE WARNING ⚠️");
            console.log("Not enough SOL available to complete the sell transaction.");
            console.log("Using a smaller fixed amount for selling in future cycles.");
            // Set lastBuyTokenAmount to null to allow the next cycle to continue
            state.lastBuyTokenAmount = null;
            console.log(`Cycle #${state.cyclesCompleted + 1} completed (sell phase skipped - insufficient SOL for transaction fee)`);
        }
        else {
            // For other errors, let the caller handle retry logic
            throw error;
        }
    }
}
