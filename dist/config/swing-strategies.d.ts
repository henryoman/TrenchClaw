import { z } from 'zod';
export declare const swingStrategySchema: z.ZodObject<{
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
    swing: z.ZodObject<{
        buyAmount: z.ZodNumber;
        intervalSeconds: z.ZodNumber;
        sellDelaySeconds: z.ZodNumber;
        totalCycles: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        intervalSeconds: number;
        buyAmount: number;
        sellDelaySeconds: number;
        totalCycles?: number | undefined;
    }, {
        intervalSeconds: number;
        buyAmount: number;
        sellDelaySeconds: number;
        totalCycles?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    swap: {
        buyTokenMint: string;
        sellTokenMint: string;
    };
    swing: {
        intervalSeconds: number;
        buyAmount: number;
        sellDelaySeconds: number;
        totalCycles?: number | undefined;
    };
}, {
    swap: {
        buyTokenMint: string;
        sellTokenMint: string;
    };
    swing: {
        intervalSeconds: number;
        buyAmount: number;
        sellDelaySeconds: number;
        totalCycles?: number | undefined;
    };
}>;
export type SwingStrategy = z.infer<typeof swingStrategySchema>;
declare let swingStrategies: SwingStrategy[];
export default swingStrategies;
