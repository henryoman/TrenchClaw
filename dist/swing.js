"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSwing = runSwing;
const swing_strategies_1 = __importDefault(require("./config/swing-strategies"));
const swap_1 = require("./swap");
/**
 * Run the swing trading bot for all configured strategies
 *
 * @param connection - Solana RPC connection
 * @param wallet - Keypair of the wallet performing the swaps
 */
async function runSwing(connection, wallet) {
    console.log(`Starting swing trading bot with ${swing_strategies_1.default.length} strategies`);
    // Initialize strategy states with next execution time set to now (immediate first execution)
    const swingStates = swing_strategies_1.default.map(strategy => ({
        config: strategy,
        nextExecutionTime: Date.now(),
        cyclesCompleted: 0,
        cyclePhase: 'buy',
        lastReceivedAmount: null
    }));
    /**
     * Schedule the next swing operation recursively
     */
    async function scheduleNextOp() {
        // Filter out completed strategies
        const activeStrategies = swingStates.filter(state => !state.config.swing.totalCycles || state.cyclesCompleted < state.config.swing.totalCycles);
        if (activeStrategies.length === 0) {
            console.log('All swing trading strategies completed!');
            return;
        }
        // Find the strategy with the earliest next execution time
        const nextStrategy = activeStrategies.reduce((earliest, current) => current.nextExecutionTime < earliest.nextExecutionTime ? current : earliest, activeStrategies[0]);
        // Calculate delay until next execution
        const now = Date.now();
        const delay = Math.max(0, nextStrategy.nextExecutionTime - now);
        console.log(`Next swing operation in ${delay / 1000} seconds`);
        // Schedule the next execution
        setTimeout(async () => {
            const { config } = nextStrategy;
            try {
                if (nextStrategy.cyclePhase === 'buy') {
                    // Execute buy phase
                    await executeBuy(connection, wallet, nextStrategy);
                    // Schedule sell phase after sellDelaySeconds
                    nextStrategy.cyclePhase = 'sell';
                    nextStrategy.nextExecutionTime = Date.now() + config.swing.sellDelaySeconds * 1000;
                    console.log(`Sell scheduled at: ${new Date(nextStrategy.nextExecutionTime).toLocaleString()}`);
                }
                else {
                    // Execute sell phase
                    await executeSell(connection, wallet, nextStrategy);
                    // Update cycle count and prepare for next buy
                    nextStrategy.cyclesCompleted++;
                    nextStrategy.cyclePhase = 'buy';
                    nextStrategy.nextExecutionTime = Date.now() + config.swing.intervalSeconds * 1000;
                    console.log(`Next cycle (#${nextStrategy.cyclesCompleted + 1}${config.swing.totalCycles ? ` of ${config.swing.totalCycles}` : ''}) scheduled at: ${new Date(nextStrategy.nextExecutionTime).toLocaleString()}`);
                }
            }
            catch (error) {
                console.error(`Swing operation failed:`, error);
                // Retry in 1 minute on failure (keep the same phase)
                nextStrategy.nextExecutionTime = Date.now() + 1 * 60 * 1000;
                console.log(`Will retry at ${new Date(nextStrategy.nextExecutionTime).toLocaleString()}`);
            }
            // Schedule the next operation
            scheduleNextOp();
        }, delay);
    }
    // Start the first operation
    await scheduleNextOp();
    console.log('Swing trading bot running...');
}
/**
 * Execute the buy phase of a swing strategy
 */
async function executeBuy(connection, wallet, state) {
    const { config } = state;
    console.log(`Executing buy phase for cycle #${state.cyclesCompleted + 1}${config.swing.totalCycles ? ` of ${config.swing.totalCycles}` : ''}`);
    console.log(`Swap direction: ${config.swap.sellTokenMint} -> ${config.swap.buyTokenMint}`);
    console.log(`Amount: ${config.swing.buyAmount}`);
    // Get the quote first to estimate the amount we'll receive
    const quoteInfo = await getSwapQuote(connection, config.swap.buyTokenMint, config.swap.sellTokenMint, config.swing.buyAmount);
    // Perform the swap
    const signature = await (0, swap_1.performSwap)(connection, wallet, config.swap.buyTokenMint, config.swap.sellTokenMint, config.swing.buyAmount);
    // Store the estimated output amount for the sell phase
    // If the quote returned NaN, use a fallback value to allow the swap to continue
    const outputAmount = Number.isNaN(quoteInfo.outputAmount) ? 0.001 : quoteInfo.outputAmount;
    state.lastReceivedAmount = outputAmount;
    console.log(`Buy successful! Transaction: ${signature}`);
    console.log(`Estimated received: ${state.lastReceivedAmount} ${config.swap.buyTokenMint}`);
}
/**
 * Execute the sell phase of a swing strategy
 */
async function executeSell(connection, wallet, state) {
    const { config } = state;
    if (!state.lastReceivedAmount) {
        throw new Error("Cannot execute sell without a previous buy amount");
    }
    console.log(`Executing sell phase for cycle #${state.cyclesCompleted + 1}${config.swing.totalCycles ? ` of ${config.swing.totalCycles}` : ''}`);
    console.log(`Swap direction: ${config.swap.buyTokenMint} -> ${config.swap.sellTokenMint}`);
    console.log(`Amount to sell: ${state.lastReceivedAmount} (from previous buy)`);
    // Perform the swap in reverse direction
    const signature = await (0, swap_1.performSwap)(connection, wallet, config.swap.sellTokenMint, // Selling what we just bought (reverse the direction)
    config.swap.buyTokenMint, // Buying what we just sold (reverse the direction)
    state.lastReceivedAmount);
    // Reset the received amount
    state.lastReceivedAmount = null;
    console.log(`Sell successful! Transaction: ${signature}`);
    console.log(`Cycle #${state.cyclesCompleted + 1} completed`);
}
/**
 * Gets a quote for a swap to estimate the output amount
 */
async function getSwapQuote(connection, buyTokenMint, sellTokenMint, amount) {
    // Determine the decimals based on the token
    // SOL has 9 decimals, USDC has 6 decimals
    let inputDecimals = 9; // Default to SOL decimals
    let outputDecimals = 6; // Default to USDC decimals
    // Check which token is being sold
    if (sellTokenMint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') {
        // USDC
        inputDecimals = 6;
    }
    // Check which token is being bought
    if (buyTokenMint === 'So11111111111111111111111111111111111111112') {
        // SOL
        outputDecimals = 9;
    }
    // Convert amount to smallest units based on token decimals
    const inputAmount = Math.floor(amount * Math.pow(10, inputDecimals));
    // Create the quote URL
    const quoteUrl = new URL('https://quote-api.jup.ag/v6/quote');
    quoteUrl.searchParams.append('inputMint', sellTokenMint);
    quoteUrl.searchParams.append('outputMint', buyTokenMint);
    quoteUrl.searchParams.append('amount', inputAmount.toString());
    quoteUrl.searchParams.append('slippageBps', '500'); // 5% slippage
    try {
        const quoteResponse = await fetch(quoteUrl.toString());
        const quoteData = await quoteResponse.json();
        if (!quoteResponse.ok) {
            throw new Error(`Jupiter quote failed: ${JSON.stringify(quoteData)}`);
        }
        // Return the raw input and output amounts, converting output to human-readable format
        return {
            inputAmount: Number(quoteData.inputAmount),
            outputAmount: Number(quoteData.outputAmount) / Math.pow(10, outputDecimals)
        };
    }
    catch (error) {
        console.error("Error getting quote:", error);
        // If there's an error, return a default estimate (this will be used for sell)
        return {
            inputAmount: inputAmount,
            outputAmount: amount // Just use the input amount as a rough estimate
        };
    }
}
