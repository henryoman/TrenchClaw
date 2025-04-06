"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.strategySchema = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const zod_1 = require("zod");
// Define the schema for DCA strategies
exports.strategySchema = zod_1.z.object({
    swap: zod_1.z.object({
        buyTokenMint: zod_1.z.string(),
        sellTokenMint: zod_1.z.string(),
    }),
    dca: zod_1.z.object({
        amount: zod_1.z.number().positive(),
        intervalMinutes: zod_1.z.number().int().positive(),
        totalBuys: zod_1.z.number().int().positive().optional(),
    }),
});
// Define schema for an array of strategies
const strategiesSchema = zod_1.z.array(exports.strategySchema);
// Load strategies from JSON file
let strategies;
try {
    const strategiesPath = path.resolve(process.cwd(), 'config', 'strategies.json');
    // Check if the file exists
    if (fs.existsSync(strategiesPath)) {
        const strategiesData = fs.readFileSync(strategiesPath, 'utf8');
        strategies = strategiesSchema.parse(JSON.parse(strategiesData));
    }
    else {
        // Default strategies if file doesn't exist
        strategies = [
            {
                swap: {
                    // SOL -> USDC
                    buyTokenMint: "So11111111111111111111111111111111111111112",
                    sellTokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
                },
                dca: {
                    amount: 0.1, // 0.1 USDC per buy
                    intervalMinutes: 60, // Every hour
                    totalBuys: 24 // 24 buys (one day)
                }
            }
        ];
        // Write default strategies to file
        fs.writeFileSync(strategiesPath, JSON.stringify(strategies, null, 2), 'utf8');
        console.log('Created default strategies.json file');
    }
}
catch (error) {
    console.error('Error loading strategies:', error);
    throw new Error('Failed to load DCA strategies');
}
exports.default = strategies;
