import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import swingStrategies, { SwingStrategy } from './config/swing-strategies';
import { performSwap } from './swap';
import { checkSpecialToken, getActualTokenBalance } from './special-tokens';

/**
 * Interface representing the state of a swing trading strategy
 */
interface SwingState {
  // The strategy configuration
  config: SwingStrategy;
  // Timestamp when the next execution should occur
  nextExecutionTime: number;
  // Number of cycles that have been completed
  cyclesCompleted: number;
  // If we're in the middle of a cycle, this tracks what we're waiting for next
  cyclePhase: 'buy' | 'sell';
  // The amount of tokens received from the last buy (to sell back)
  lastReceivedAmount: number | null;
}

/**
 * Run the swing trading bot for all configured strategies
 * 
 * @param connection - Solana RPC connection
 * @param wallet - Keypair of the wallet performing the swaps
 */
export async function runSwing(connection: Connection, wallet: Keypair): Promise<void> {
  console.log(`Starting swing trading bot with ${swingStrategies.length} strategies`);
  
  // Initialize strategy states with next execution time set to now (immediate first execution)
  const swingStates: SwingState[] = swingStrategies.map(strategy => ({
    config: strategy,
    nextExecutionTime: Date.now(),
    cyclesCompleted: 0,
    cyclePhase: 'buy',
    lastReceivedAmount: null
  }));
  
  /**
   * Schedule the next swing operation recursively
   */
  async function scheduleNextOp(): Promise<void> {
    // Filter out completed strategies
    const activeStrategies = swingStates.filter(
      state => !state.config.swing.totalCycles || state.cyclesCompleted < state.config.swing.totalCycles
    );
    
    if (activeStrategies.length === 0) {
      console.log('All swing trading strategies completed!');
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
        } else {
          try {
            // Execute sell phase
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
          nextStrategy.nextExecutionTime = Date.now() + config.swing.intervalSeconds * 1000;
          
          console.log(`Next cycle (#${nextStrategy.cyclesCompleted + 1}${config.swing.totalCycles ? ` of ${config.swing.totalCycles}` : ''}) scheduled at: ${new Date(nextStrategy.nextExecutionTime).toLocaleString()}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Swing operation failed: ${errorMessage}`);
        
        // Check for specific error conditions
        if (errorMessage.includes("COULD_NOT_FIND_ANY_ROUTE")) {
          console.log("⚠️ LIQUIDITY WARNING ⚠️");
          if (nextStrategy.cyclePhase === 'buy') {
            console.log(`No trading route found for ${config.swap.sellTokenMint} -> ${config.swap.buyTokenMint}.`);
            console.log("This token pair either has low liquidity or no direct trading pair.");
            
            // Move to the next cycle
            nextStrategy.cyclesCompleted++;
            nextStrategy.cyclePhase = 'buy';
            nextStrategy.nextExecutionTime = Date.now() + config.swing.intervalSeconds * 1000;
            console.log(`Skipping this cycle and moving to the next one.`);
          } else {
            // For sell phase, this is handled in executeSell
            // But let's handle it here as well as a fallback
            console.log(`Token ${config.swap.buyTokenMint} cannot be sold back to ${config.swap.sellTokenMint}.`);
            console.log("Moving to the next cycle. The tokens will remain in your wallet.");
            
            // Move to the next cycle
            nextStrategy.cyclesCompleted++;
            nextStrategy.cyclePhase = 'buy';
            nextStrategy.nextExecutionTime = Date.now() + config.swing.intervalSeconds * 1000;
          }
          console.log(`Next cycle (#${nextStrategy.cyclesCompleted + 1}${config.swing.totalCycles ? ` of ${config.swing.totalCycles}` : ''}) scheduled at: ${new Date(nextStrategy.nextExecutionTime).toLocaleString()}`);
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
            nextStrategy.nextExecutionTime = Date.now() + config.swing.intervalSeconds * 1000;
            nextStrategy.lastReceivedAmount = null; // Reset the received amount
            console.log(`Skipping sell phase due to insufficient SOL for transaction fee`);
            console.log(`Next cycle (#${nextStrategy.cyclesCompleted + 1}${config.swing.totalCycles ? ` of ${config.swing.totalCycles}` : ''}) scheduled at: ${new Date(nextStrategy.nextExecutionTime).toLocaleString()}`);
          }
        } else {
          // Retry in 1 minute on other failures (keep the same phase)
          nextStrategy.nextExecutionTime = Date.now() + 1 * 60 * 1000;
          console.log(`Will retry at ${new Date(nextStrategy.nextExecutionTime).toLocaleString()}`);
        }
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
async function executeBuy(
  connection: Connection,
  wallet: Keypair,
  state: SwingState
): Promise<void> {
  const { config } = state;
  
  console.log(`Executing buy phase for cycle #${state.cyclesCompleted + 1}${config.swing.totalCycles ? ` of ${config.swing.totalCycles}` : ''}`);
  console.log(`Swap direction: ${config.swap.sellTokenMint} -> ${config.swap.buyTokenMint}`);
  console.log(`Amount: ${config.swing.buyAmount}`);
  
  // Get the quote first to estimate the amount we'll receive
  const quoteInfo = await getSwapQuote(
    connection,
    config.swap.buyTokenMint,
    config.swap.sellTokenMint,
    config.swing.buyAmount
  );
  
  // Perform the swap
  const signature = await performSwap(
    connection,
    wallet,
    config.swap.buyTokenMint,
    config.swap.sellTokenMint,
    config.swing.buyAmount
  );
  
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
async function executeSell(
  connection: Connection,
  wallet: Keypair,
  state: SwingState
): Promise<void> {
  const { config } = state;
  
  if (!state.lastReceivedAmount) {
    throw new Error("Cannot execute sell without a previous buy amount");
  }
  
  console.log(`Executing sell phase for cycle #${state.cyclesCompleted + 1}${config.swing.totalCycles ? ` of ${config.swing.totalCycles}` : ''}`);
  console.log(`Swap direction: ${config.swap.buyTokenMint} -> ${config.swap.sellTokenMint}`);
  console.log(`Amount to sell: ${state.lastReceivedAmount} (from previous buy)`);
  
  try {
    let sellAmount: number;
    const isDevMode = process.env.DEV_MODE === 'true';
    
    if (isDevMode) {
      // In dev mode, use the estimated amount from the quote
      sellAmount = state.lastReceivedAmount || 0.001;
      console.log(`[DEV MODE] Using estimated amount of ${sellAmount} tokens`);
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
            sellAmount = specialToken.minAmount;
          } else if (actualBalance > 0) {
            console.log(`Using all available ${actualBalance} tokens for selling (less than minimum)`);
            sellAmount = actualBalance;
          } else {
            // Fallback to estimated amount if no tokens found
            sellAmount = state.lastReceivedAmount || 0.001;
            console.log(`No ${specialToken.name} tokens found, using fixed small amount for selling: ${sellAmount}`);
          }
        } else {
          // Just get the token balance for special token without minimum
          const actualBalance = await getActualTokenBalance(connection, wallet, config.swap.buyTokenMint);
          if (actualBalance > 0) {
            sellAmount = actualBalance;
            console.log(`Found ${sellAmount} ${specialToken.name} tokens to sell`);
          } else {
            sellAmount = state.lastReceivedAmount || 0.001;
            console.log(`Using fixed small amount for selling: ${sellAmount}`);
          }
        }
      } else {
        // For regular tokens, just get the balance
        try {
          // Use our helper function to get the balance
          const actualBalance = await getActualTokenBalance(connection, wallet, config.swap.buyTokenMint);
          if (actualBalance > 0) {
            sellAmount = actualBalance;
            console.log(`Found ${sellAmount} tokens of ${config.swap.buyTokenMint}`);
          } else {
            // Fallback if no token account found
            sellAmount = state.lastReceivedAmount || 0.001;
            console.log(`No token account found for ${config.swap.buyTokenMint}, using estimated amount: ${sellAmount}`);
          }
        } catch (error) {
          // If there's an error querying the token account, use the fallback
          console.error(`Error querying token account: ${error instanceof Error ? error.message : String(error)}`);
          sellAmount = state.lastReceivedAmount || 0.001;
          console.log(`Using fallback amount of ${sellAmount} tokens due to error`);
        }
      }
    }
    
    console.log(`Selling ${config.swap.buyTokenMint} back to SOL (${sellAmount} tokens)`);
    
    const signature = await performSwap(
      connection,
      wallet,
      config.swap.sellTokenMint,  // Selling what we just bought (reverse the direction)
      config.swap.buyTokenMint,   // Buying what we just sold (reverse the direction)
      sellAmount
    );
    
    // Reset the received amount
    state.lastReceivedAmount = null;
    
    console.log(`Sell successful! Transaction: ${signature}`);
    console.log(`Cycle #${state.cyclesCompleted + 1} completed`);
  } catch (error) {
    // If we get a "could not find route" error, try with a smaller amount
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Sell attempt failed: ${errorMessage}`);
    
    if (errorMessage.includes("COULD_NOT_FIND_ANY_ROUTE")) {
      console.log("⚠️ LIQUIDITY WARNING ⚠️");
      console.log(`Token ${config.swap.buyTokenMint} cannot be sold back to SOL.`);
      console.log("This token either has low liquidity, no direct trading pair with SOL, or selling restrictions.");
      console.log("Marking this cycle as completed and moving to the next cycle. The tokens will remain in your wallet.");
      
      // Set lastReceivedAmount to null to allow the next cycle to continue
      state.lastReceivedAmount = null;
      console.log(`Cycle #${state.cyclesCompleted + 1} completed (sell phase skipped - token retained in wallet)`);
    } else if (errorMessage.includes("Insufficient SOL balance")) {
      console.log("⚠️ BALANCE WARNING ⚠️");
      console.log("Not enough SOL available to complete the sell transaction.");
      console.log("Using a smaller fixed amount for selling in future cycles.");
      
      // Set lastReceivedAmount to null to allow the next cycle to continue
      state.lastReceivedAmount = null;
      console.log(`Cycle #${state.cyclesCompleted + 1} completed (sell phase skipped - insufficient SOL for transaction fee)`);
    } else {
      // For other errors, let the caller handle retry logic
      throw error;
    }
  }
}

/**
 * Gets a quote for a swap to estimate the output amount
 */
async function getSwapQuote(
  connection: Connection,
  buyTokenMint: string,
  sellTokenMint: string,
  amount: number
): Promise<{ inputAmount: number, outputAmount: number }> {
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
  } catch (error) {
    console.error("Error getting quote:", error);
    // If there's an error, return a default estimate (this will be used for sell)
    return {
      inputAmount: inputAmount,
      outputAmount: amount // Just use the input amount as a rough estimate
    };
  }
}