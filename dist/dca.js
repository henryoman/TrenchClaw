"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDCA = runDCA;
const strategies_1 = __importDefault(require("./config/strategies"));
const swap_1 = require("./swap");
/**
 * Run the DCA bot for all configured strategies
 *
 * @param connection - Solana RPC connection
 * @param wallet - Keypair of the wallet performing the swaps
 */
async function runDCA(connection, wallet) {
    console.log(`Starting DCA bot with ${strategies_1.default.length} strategies`);
    // Initialize strategy states with next execution time set to now (immediate first execution)
    const strategyStates = strategies_1.default.map(strategy => ({
        config: strategy,
        nextExecutionTime: Date.now(),
        buysCompleted: 0
    }));
    /**
     * Schedule the next buy operation recursively
     */
    async function scheduleNextBuy() {
        // Filter out completed strategies
        const activeStrategies = strategyStates.filter(state => !state.config.dca.totalBuys || state.buysCompleted < state.config.dca.totalBuys);
        if (activeStrategies.length === 0) {
            console.log('All DCA strategies completed!');
            return;
        }
        // Find the strategy with the earliest next execution time
        const nextStrategy = activeStrategies.reduce((earliest, current) => current.nextExecutionTime < earliest.nextExecutionTime ? current : earliest, activeStrategies[0]);
        // Calculate delay until next execution
        const now = Date.now();
        const delay = Math.max(0, nextStrategy.nextExecutionTime - now);
        console.log(`Next strategy execution in ${delay / 1000} seconds`);
        // Schedule the next execution
        setTimeout(async () => {
            const { config } = nextStrategy;
            try {
                console.log(`Executing DCA strategy: ${config.swap.sellTokenMint} -> ${config.swap.buyTokenMint}`);
                console.log(`Amount: ${config.dca.amount}, Buy #${nextStrategy.buysCompleted + 1}${config.dca.totalBuys ? ` of ${config.dca.totalBuys}` : ''}`);
                // Perform the swap
                const signature = await (0, swap_1.performSwap)(connection, wallet, config.swap.buyTokenMint, config.swap.sellTokenMint, config.dca.amount);
                // Update strategy state
                nextStrategy.buysCompleted++;
                nextStrategy.nextExecutionTime = Date.now() + config.dca.intervalMinutes * 60 * 1000;
                console.log(`Swap successful! Transaction: ${signature}`);
                console.log(`Next execution scheduled at: ${new Date(nextStrategy.nextExecutionTime).toLocaleString()}`);
            }
            catch (error) {
                console.error(`DCA execution failed:`, error);
                // Retry in 5 minutes on failure
                nextStrategy.nextExecutionTime = Date.now() + 5 * 60 * 1000;
                console.log(`Will retry at ${new Date(nextStrategy.nextExecutionTime).toLocaleString()}`);
            }
            // Schedule the next buy
            scheduleNextBuy();
        }, delay);
    }
    // Start the first buy operation
    await scheduleNextBuy();
    console.log('DCA bot running...');
}
