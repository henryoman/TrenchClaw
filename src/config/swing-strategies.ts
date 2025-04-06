import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

// Define the schema for swing trading strategies
export const swingStrategySchema = z.object({
  swap: z.object({
    buyTokenMint: z.string(),
    sellTokenMint: z.string(),
  }),
  swing: z.object({
    buyAmount: z.number().positive(),
    intervalSeconds: z.number().int().positive(),
    sellDelaySeconds: z.number().int().positive(),
    totalCycles: z.number().int().positive().optional(),
  }),
});

// Define type for SwingStrategy based on the schema
export type SwingStrategy = z.infer<typeof swingStrategySchema>;

// Define schema for an array of strategies
const strategiesSchema = z.array(swingStrategySchema);

// Load strategies from JSON file
let swingStrategies: SwingStrategy[];

try {
  const strategiesPath = path.resolve(process.cwd(), 'config', 'swing-strategies.json');
  
  // Check if the file exists
  if (fs.existsSync(strategiesPath)) {
    const strategiesData = fs.readFileSync(strategiesPath, 'utf8');
    swingStrategies = strategiesSchema.parse(JSON.parse(strategiesData));
  } else {
    // Default strategies if file doesn't exist
    swingStrategies = [
      {
        swap: {
          // SOL -> USDC and back
          sellTokenMint: "So11111111111111111111111111111111111111112",
          buyTokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
        },
        swing: {
          buyAmount: 0.001,         // 0.001 SOL per buy
          intervalSeconds: 60,      // Every minute
          sellDelaySeconds: 15,     // Sell 15 seconds after buying
          totalCycles: 10           // Do 10 cycles
        }
      }
    ];
    
    // Write default strategies to file
    fs.writeFileSync(
      strategiesPath, 
      JSON.stringify(swingStrategies, null, 2), 
      'utf8'
    );
    
    console.log('Created default swing-strategies.json file');
  }
} catch (error) {
  console.error('Error loading swing strategies:', error);
  throw new Error('Failed to load swing trading strategies');
}

export default swingStrategies;