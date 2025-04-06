import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import percentageStrategies, { PercentageStrategy } from './config/percentage-strategies';
import { performSwap } from './swap';
import env from './config/env';
import { checkSpecialToken, getActualTokenBalance } from './special-tokens';

/**
 * Interface representing the state of a percentage-based trading strategy
 */
interface PercentageState {
  // The strategy configuration
  config: PercentageStrategy;
  // Timestamp when the next execution should occur
  nextExecutionTime: number;
  // Timestamp when the sell should occur
  sellExecutionTime: number | null;
  // Number of cycles that have been completed
  cyclesCompleted: number;
  // If we're in the middle of a cycle, this tracks what we're waiting for next
  cyclePhase: 'buy' | 'sell';
  // The token amount received from the last buy (to sell back)
  lastBuyTokenAmount: number | null;
}

/**
 * Run the percentage-based trading bot for all configured strategies
 * 
 * @param connection - Solana RPC connection
 * @param wallet - Keypair of the wallet performing the swaps
 */
export async function runPercentageTrading(connection: Connection, wallet: Keypair): Promise<void> {
  console.log(`Starting percentage-based trading bot with ${percentageStrategies.length} strategies`);
  
  // Initialize strategy states with next execution time set to now (immediate first execution)
  const strategyStates: PercentageState[] = percentageStrategies.map(strategy => ({
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
  async function scheduleNextOp(): Promise<void> {
    // Filter out completed strategies
    const activeStrategies = strategyStates.filter(
      state => !state.config.percentage.totalCycles || state.cyclesCompleted < state.config.percentage.totalCycles
    );
    
    if (activeStrategies.length === 0) {
      console.log('All percentage-based trading strategies completed!');
      return;
    }
    
    // Find the strategy with the earliest next execution time
    const nextStrategy = activeStrategies.reduce(
      (earliest, current) => {
        // Compare sell time first if in sell phase
        if (current.cyclePhase === 'sell' && earliest.cyclePhase === 'sell') {
          return current.sellExecutionTime! < earliest.sellExecutionTime! ? current : earliest;
        } else if (current.cyclePhase === 'sell') {
          return current; // Prioritize sell operations
        } else if (earliest.cyclePhase === 'sell') {
          return earliest;
        }
        // Compare buy time if both in buy phase
        return current.nextExecutionTime < earliest.nextExecutionTime ? current : earliest;
      },
      activeStrategies[0]
    );
    
    // Calculate delay until next execution
    const now = Date.now();
    let delay: number;
    let operationType: string;
    
    if (nextStrategy.cyclePhase === 'sell' && nextStrategy.sellExecutionTime) {
      delay = Math.max(0, nextStrategy.sellExecutionTime - now);
      operationType = 'sell';
    } else {
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
        } else {
          // Execute sell phase
          try {
            await executeSell(connection, wallet, nextStrategy);
          } catch (error) {
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
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Percentage-based trading operation failed: ${errorMessage}`);
        
        // Check for specific error conditions
        if (errorMessage.includes("COULD_NOT_FIND_ANY_ROUTE")) {
          console.log("⚠️ LIQUIDITY WARNING ⚠️");
          if (nextStrategy.cyclePhase === 'buy') {
            console.log(`No trading route found for ${config.swap.sellTokenMint} -> ${config.swap.buyTokenMint}.`);
            console.log("This token pair either has low liquidity or no direct trading pair.");
            
            // Move to the next cycle
            nextStrategy.cyclesCompleted++;
            nextStrategy.cyclePhase = 'buy';
            nextStrategy.nextExecutionTime = Date.now() + config.percentage.cycleSeconds * 1000;
            nextStrategy.sellExecutionTime = null;
            console.log(`Skipping this cycle and moving to the next one.`);
          } else {
            // For sell phase, this is handled in executeSell
            // But let's handle it here as well as a fallback
            console.log(`Token ${config.swap.buyTokenMint} cannot be sold back to ${config.swap.sellTokenMint}.`);
            console.log("Moving to the next cycle. The tokens will remain in your wallet.");
            
            // Move to the next cycle
            nextStrategy.cyclesCompleted++;
            nextStrategy.cyclePhase = 'buy';
            nextStrategy.nextExecutionTime = Date.now() + config.percentage.cycleSeconds * 1000;
            nextStrategy.sellExecutionTime = null;
          }
          console.log(`Next cycle (#${nextStrategy.cyclesCompleted + 1}${config.percentage.totalCycles ? ` of ${config.percentage.totalCycles}` : ''}) scheduled at: ${new Date(nextStrategy.nextExecutionTime).toLocaleString()}`);
        } else if (errorMessage.includes("Insufficient SOL balance") || 
                  errorMessage.includes("insufficient lamports")) {
          console.log("⚠️ BALANCE WARNING ⚠️");
          console.log("Not enough SOL available to complete the transaction.");
          
          // Set a longer retry for balance issues - user needs to add funds
          if (nextStrategy.cyclePhase === 'buy') {
            nextStrategy.nextExecutionTime = Date.now() + 15 * 60 * 1000; // 15 minutes
            console.log(`Will retry buy with a longer delay: ${new Date(nextStrategy.nextExecutionTime).toLocaleString()}`);
          } else {
            // For sell phase, move to next cycle since SOL balance is used for transaction fees only
            nextStrategy.cyclesCompleted++;
            nextStrategy.cyclePhase = 'buy';
            nextStrategy.nextExecutionTime = Date.now() + config.percentage.cycleSeconds * 1000;
            nextStrategy.sellExecutionTime = null;
            nextStrategy.lastBuyTokenAmount = null; // Reset the buy amount
            console.log(`Skipping sell phase due to insufficient SOL for transaction fee`);
            console.log(`Next cycle (#${nextStrategy.cyclesCompleted + 1}${config.percentage.totalCycles ? ` of ${config.percentage.totalCycles}` : ''}) scheduled at: ${new Date(nextStrategy.nextExecutionTime).toLocaleString()}`);
          }
        } else {
          // Retry in 1 minute on other failures (keep the same phase)
          if (nextStrategy.cyclePhase === 'buy') {
            nextStrategy.nextExecutionTime = Date.now() + 1 * 60 * 1000;
          } else {
            nextStrategy.sellExecutionTime = Date.now() + 1 * 60 * 1000;
          }
          console.log(`Will retry at ${new Date(nextStrategy.cyclePhase === 'buy' ? nextStrategy.nextExecutionTime : nextStrategy.sellExecutionTime!).toLocaleString()}`);
        }
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
async function executeBuy(
  connection: Connection,
  wallet: Keypair,
  state: PercentageState
): Promise<void> {
  const { config } = state;
  
  console.log(`Executing buy phase for cycle #${state.cyclesCompleted + 1}${config.percentage.totalCycles ? ` of ${config.percentage.totalCycles}` : ''}`);
  
  // Get current SOL balance
  const balance = await connection.getBalance(wallet.publicKey);
  const solBalance = balance / LAMPORTS_PER_SOL;
  
  // Calculate buy amount (percentage of wallet balance)
  const buyPercentage = config.percentage.buyPercentage / 100;
  const buyAmount = solBalance * buyPercentage;
  
  console.log(`Wallet SOL balance: ${solBalance}`);
  console.log(`Using ${config.percentage.buyPercentage}% (${buyAmount.toFixed(6)} SOL) to buy ${config.swap.buyTokenMint}`);
  console.log(`Swap direction: ${config.swap.sellTokenMint} -> ${config.swap.buyTokenMint}`);
  
  // Perform the swap
  const signature = await performSwap(
    connection,
    wallet,
    config.swap.buyTokenMint,
    config.swap.sellTokenMint,
    buyAmount
  );
  
  // Store token info for the sell phase
  // We can't easily know the exact amount received, so we'll use token account queries during sell
  state.lastBuyTokenAmount = buyAmount;  // Store the SOL amount for reference
  
  console.log(`Buy successful! Transaction: ${signature}`);
  console.log(`Cycle phase: Bought tokens with ${buyAmount.toFixed(6)} SOL`);
}

/**
 * Execute the sell phase, selling 100% of the token balance
 */
async function executeSell(
  connection: Connection,
  wallet: Keypair,
  state: PercentageState
): Promise<void> {
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
  const isDevMode = env.PRIVATE_KEY === 'test_private_key' || 
                    env.HELIUS_API_KEY === 'test_api_key';
  
  try {
    // Use a more accurate estimate based on the token we're selling
    let tokenAmount: number;
    
    if (isDevMode) {
      // In dev mode, just use our reference amount
      tokenAmount = state.lastBuyTokenAmount || 0.001;
      console.log(`[DEV MODE] Using reference amount of ${tokenAmount} tokens`);
    } else {
      // Check if token requires special handling
      const specialToken = checkSpecialToken(config.swap.buyTokenMint);
      if (specialToken) {
        console.log(`Special token detected: ${specialToken.name}`);
        
        // For special tokens, we might need to use a minimum amount
        if (specialToken.minAmount) {
          console.log(`${specialToken.name} requires a minimum amount of ${specialToken.minAmount} for selling`);
          
          // Get the actual balance
          const actualBalance = await getActualTokenBalance(connection, wallet, config.swap.buyTokenMint);
          if (actualBalance >= specialToken.minAmount) {
            console.log(`Using minimum required amount of ${specialToken.minAmount} tokens for selling`);
            tokenAmount = specialToken.minAmount;
          } else if (actualBalance > 0) {
            console.log(`Using all available ${actualBalance} tokens for selling (less than minimum)`);
            tokenAmount = actualBalance;
          } else {
            // Fallback to estimated amount if no tokens found
            tokenAmount = state.lastBuyTokenAmount || 0.001;
            console.log(`No ${specialToken.name} tokens found, using fixed small amount for selling: ${tokenAmount}`);
          }
        } else {
          // Just get the token balance for special token without minimum
          const actualBalance = await getActualTokenBalance(connection, wallet, config.swap.buyTokenMint);
          if (actualBalance > 0) {
            tokenAmount = actualBalance;
            console.log(`Found ${tokenAmount} ${specialToken.name} tokens to sell`);
          } else {
            tokenAmount = state.lastBuyTokenAmount || 0.001;
            console.log(`Using fixed small amount for selling: ${tokenAmount}`);
          }
        }
      } else {
        // For regular tokens, just get the balance
        try {
          // Use our helper function to get the balance
          const actualBalance = await getActualTokenBalance(connection, wallet, config.swap.buyTokenMint);
          if (actualBalance > 0) {
            tokenAmount = actualBalance;
            console.log(`Found ${tokenAmount} tokens of ${config.swap.buyTokenMint}`);
          } else {
            // Fallback if no token account found
            tokenAmount = state.lastBuyTokenAmount || 0.001;
            console.log(`No token account found for ${config.swap.buyTokenMint}, using estimated amount: ${tokenAmount}`);
          }
        } catch (error) {
          // If there's an error querying the token account, use the fallback
          console.error(`Error querying token account: ${error instanceof Error ? error.message : String(error)}`);
          tokenAmount = state.lastBuyTokenAmount || 0.001;
          console.log(`Using fallback amount of ${tokenAmount} tokens due to error`);
        }
      }
    }
    
    console.log(`Selling 100% of ${config.swap.buyTokenMint} back to SOL (${tokenAmount} tokens)`);
    
    const signature = await performSwap(
      connection,
      wallet,
      config.swap.sellTokenMint,  // Selling what we just bought (reverse the direction)
      config.swap.buyTokenMint,   // Buying what we just sold (reverse the direction)
      tokenAmount                 // Using our best estimate of the token balance
    );
    
    // Reset the received amount
    state.lastBuyTokenAmount = null;
    
    console.log(`Sell successful! Transaction: ${signature}`);
    console.log(`Cycle #${state.cyclesCompleted + 1} sell phase completed`);
  } catch (error) {
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
    } else if (errorMessage.includes("Insufficient SOL balance")) {
      console.log("⚠️ BALANCE WARNING ⚠️");
      console.log("Not enough SOL available to complete the sell transaction.");
      console.log("Using a smaller fixed amount for selling in future cycles.");
      
      // Set lastBuyTokenAmount to null to allow the next cycle to continue
      state.lastBuyTokenAmount = null;
      console.log(`Cycle #${state.cyclesCompleted + 1} completed (sell phase skipped - insufficient SOL for transaction fee)`);
    } else {
      // For other errors, let the caller handle retry logic
      throw error;
    }
  }
}