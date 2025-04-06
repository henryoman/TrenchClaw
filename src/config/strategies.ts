import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

// Define the schema for DCA strategies
export const strategySchema = z.object({
  swap: z.object({
    buyTokenMint: z.string(),
    sellTokenMint: z.string(),
  }),
  dca: z.object({
    amount: z.number().positive(),
    intervalSeconds: z.number().int().positive(),
    totalBuys: z.number().int().positive().optional(),
  }),
});

// Define type for Strategy based on the schema
export type Strategy = z.infer<typeof strategySchema>;

// Define schema for an array of strategies
const strategiesSchema = z.array(strategySchema);

// Load strategies from JSON file
let strategies: Strategy[];

try {
  const strategiesPath = path.resolve(process.cwd(), 'config', 'strategies.json');
  
  // Check if the file exists
  if (fs.existsSync(strategiesPath)) {
    const strategiesData = fs.readFileSync(strategiesPath, 'utf8');
    strategies = strategiesSchema.parse(JSON.parse(strategiesData));
  } else {
    // Default strategies if file doesn't exist
    strategies = [
      {
        swap: {
          // SOL -> USDC
          buyTokenMint: "So11111111111111111111111111111111111111112",
          sellTokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
        },
        dca: {
          amount: 0.1,         // 0.1 USDC per buy
          intervalSeconds: 3600,  // Every hour (3600 seconds)
          totalBuys: 24        // 24 buys (one day)
        }
      }
    ];
    
    // Write default strategies to file
    fs.writeFileSync(
      strategiesPath, 
      JSON.stringify(strategies, null, 2), 
      'utf8'
    );
    
    console.log('Created default strategies.json file');
  }
} catch (error) {
  console.error('Error loading strategies:', error);
  throw new Error('Failed to load DCA strategies');
}

export default strategies;