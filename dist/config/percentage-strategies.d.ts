import { z } from 'zod';
/**
 * Schema for percentage-based trading strategies
 * These strategies use a percentage of the wallet's SOL balance for buying,
 * and sell after a percentage of the cycle time has elapsed
 */
export declare const percentageStrategySchema: z.ZodObject<{
    swap: z.ZodObject<{
        buyTokenMint: z.ZodString;
        sellTokenMint: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        buyTokenMint: string;
        sellTokenMint: string;
    }, {
        buyTokenMint: string;
        sellTokenMint: string;
    }>;
    percentage: z.ZodObject<{
        buyPercentage: z.ZodDefault<z.ZodNumber>;
        sellTimePercentage: z.ZodDefault<z.ZodNumber>;
        cycleSeconds: z.ZodNumber;
        totalCycles: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        buyPercentage: number;
        sellTimePercentage: number;
        cycleSeconds: number;
        totalCycles?: number | undefined;
    }, {
        cycleSeconds: number;
        totalCycles?: number | undefined;
        buyPercentage?: number | undefined;
        sellTimePercentage?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    swap: {
        buyTokenMint: string;
        sellTokenMint: string;
    };
    percentage: {
        buyPercentage: number;
        sellTimePercentage: number;
        cycleSeconds: number;
        totalCycles?: number | undefined;
    };
}, {
    swap: {
        buyTokenMint: string;
        sellTokenMint: string;
    };
    percentage: {
        cycleSeconds: number;
        totalCycles?: number | undefined;
        buyPercentage?: number | undefined;
        sellTimePercentage?: number | undefined;
    };
}>;
export type PercentageStrategy = z.infer<typeof percentageStrategySchema>;
declare let strategies: PercentageStrategy[];
export default strategies;
