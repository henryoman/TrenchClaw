import { z } from 'zod';
export declare const strategySchema: z.ZodObject<{
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
    dca: z.ZodObject<{
        amount: z.ZodNumber;
        intervalSeconds: z.ZodNumber;
        totalBuys: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        amount: number;
        intervalSeconds: number;
        totalBuys?: number | undefined;
    }, {
        amount: number;
        intervalSeconds: number;
        totalBuys?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    swap: {
        buyTokenMint: string;
        sellTokenMint: string;
    };
    dca: {
        amount: number;
        intervalSeconds: number;
        totalBuys?: number | undefined;
    };
}, {
    swap: {
        buyTokenMint: string;
        sellTokenMint: string;
    };
    dca: {
        amount: number;
        intervalSeconds: number;
        totalBuys?: number | undefined;
    };
}>;
export type Strategy = z.infer<typeof strategySchema>;
declare let strategies: Strategy[];
export default strategies;
