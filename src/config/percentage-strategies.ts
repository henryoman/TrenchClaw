import * as fs from 'fs';
import { z } from 'zod';
import path from 'path';

/**
 * Schema for percentage-based trading strategies
 * These strategies use a percentage of the wallet's SOL balance for buying,
 * and sell after a percentage of the cycle time has elapsed
 */
export const percentageStrategySchema = z.object({
  swap: z.object({
    buyTokenMint: z.string(),
    sellTokenMint: z.string(),
  }),
  percentage: z.object({
    buyPercentage: z.number().min(1).max(100).default(90),  // Default buy 90% of wallet balance
    sellTimePercentage: z.number().min(1).max(99).default(60),  // Default sell at 60% of cycle
    cycleSeconds: z.number().int().positive(),
    totalCycles: z.number().int().positive().optional(),
  }),
});

export type PercentageStrategy = z.infer<typeof percentageStrategySchema>;

const strategiesSchema = z.array(percentageStrategySchema);

let strategies: PercentageStrategy[] = [];

try {
  const configPath = path.resolve(process.cwd(), 'config', 'percentage-strategies.json');
  if (fs.existsSync(configPath)) {
    const fileData = fs.readFileSync(configPath, 'utf8');
    strategies = strategiesSchema.parse(JSON.parse(fileData));
    console.log(`Loaded ${strategies.length} percentage-based trading strategies`);
  } else {
    console.log('No percentage-strategies.json file found');
  }
} catch (error) {
  console.error('Error loading percentage strategies:', error);
  // Continue with empty strategies array
}

export default strategies;