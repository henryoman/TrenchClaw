import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import strategies, { Strategy } from './config/strategies';
import { performSwap } from './swap';

/**
 * Interface representing the state of a DCA strategy
 */
interface StrategyState {
  // The strategy configuration
  config: Strategy;
  // Timestamp when the next execution should occur
  nextExecutionTime: number;
  // Number of buys that have been completed
  buysCompleted: number;
}

/**
 * Run the DCA bot for all configured strategies
 * 
 * @param connection - Solana RPC connection
 * @param wallet - Keypair of the wallet performing the swaps
 */
export async function runDCA(connection: Connection, wallet: Keypair): Promise<void> {
  console.log(`Starting DCA bot with ${strategies.length} strategies`);
  
  // Initialize strategy states with next execution time set to now (immediate first execution)
  const strategyStates: StrategyState[] = strategies.map(strategy => ({
    config: strategy,
    nextExecutionTime: Date.now(),
    buysCompleted: 0
  }));
  
  /**
   * Schedule the next buy operation recursively
   */
  async function scheduleNextBuy(): Promise<void> {
    // Filter out completed strategies
    const activeStrategies = strategyStates.filter(
      state => !state.config.dca.totalBuys || state.buysCompleted < state.config.dca.totalBuys
    );
    
    if (activeStrategies.length === 0) {
      console.log('All DCA strategies completed!');
      return;
    }
    
    // Find the strategy with the earliest next execution time
    const nextStrategy = activeStrategies.reduce(
      (earliest, current) => current.nextExecutionTime < earliest.nextExecutionTime ? current : earliest,
      activeStrategies[0]
    );
    
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
        const signature = await performSwap(
          connection,
          wallet,
          config.swap.buyTokenMint,
          config.swap.sellTokenMint,
          config.dca.amount
        );
        
        // Update strategy state
        nextStrategy.buysCompleted++;
        nextStrategy.nextExecutionTime = Date.now() + config.dca.intervalSeconds * 1000;
        
        console.log(`Swap successful! Transaction: ${signature}`);
        console.log(`Next execution scheduled at: ${new Date(nextStrategy.nextExecutionTime).toLocaleString()}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`DCA execution failed: ${errorMessage}`);
        
        // Check for specific error types
        if (errorMessage.includes("COULD_NOT_FIND_ANY_ROUTE")) {
          console.log("⚠️ LIQUIDITY WARNING ⚠️");
          console.log(`No trading route found for ${config.swap.sellTokenMint} -> ${config.swap.buyTokenMint}.`);
          console.log("This token pair either has low liquidity or no direct trading pair.");
          
          // Still count this as a completed buy for scheduling purposes
          nextStrategy.buysCompleted++;
          nextStrategy.nextExecutionTime = Date.now() + config.dca.intervalSeconds * 1000;
          console.log(`Skipping this buy and moving to the next scheduled execution.`);
          console.log(`Next execution scheduled at: ${new Date(nextStrategy.nextExecutionTime).toLocaleString()}`);
        } else if (errorMessage.includes("Insufficient SOL balance") || 
                  errorMessage.includes("insufficient lamports")) {
          console.log("⚠️ BALANCE WARNING ⚠️");
          console.log("Not enough SOL available to complete the transaction.");
          
          // Set a longer retry for balance issues - user needs to add funds
          nextStrategy.nextExecutionTime = Date.now() + 15 * 60 * 1000; // 15 minutes
          console.log(`Will retry with a longer delay: ${new Date(nextStrategy.nextExecutionTime).toLocaleString()}`);
        } else {
          // For other errors, retry in 5 minutes
          nextStrategy.nextExecutionTime = Date.now() + 5 * 60 * 1000;
          console.log(`Will retry at ${new Date(nextStrategy.nextExecutionTime).toLocaleString()}`);
        }
      }
      
      // Schedule the next buy
      scheduleNextBuy();
    }, delay);
  }
  
  // Start the first buy operation
  await scheduleNextBuy();
  console.log('DCA bot running...');
}