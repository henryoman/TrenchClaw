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
exports.swingStrategySchema = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const zod_1 = require("zod");
// Define the schema for swing trading strategies
exports.swingStrategySchema = zod_1.z.object({
    swap: zod_1.z.object({
        buyTokenMint: zod_1.z.string(),
        sellTokenMint: zod_1.z.string(),
    }),
    swing: zod_1.z.object({
        buyAmount: zod_1.z.number().positive(),
        intervalSeconds: zod_1.z.number().int().positive(),
        sellDelaySeconds: zod_1.z.number().int().positive(),
        totalCycles: zod_1.z.number().int().positive().optional(),
    }),
});
// Define schema for an array of strategies
const strategiesSchema = zod_1.z.array(exports.swingStrategySchema);
// Load strategies from JSON file
let swingStrategies;
try {
    const strategiesPath = path.resolve(process.cwd(), 'config', 'swing-strategies.json');
    // Check if the file exists
    if (fs.existsSync(strategiesPath)) {
        const strategiesData = fs.readFileSync(strategiesPath, 'utf8');
        swingStrategies = strategiesSchema.parse(JSON.parse(strategiesData));
    }
    else {
        // Default strategies if file doesn't exist
        swingStrategies = [
            {
                swap: {
                    // SOL -> USDC and back
                    sellTokenMint: "So11111111111111111111111111111111111111112",
                    buyTokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
                },
                swing: {
                    buyAmount: 0.001, // 0.001 SOL per buy
                    intervalSeconds: 60, // Every minute
                    sellDelaySeconds: 15, // Sell 15 seconds after buying
                    totalCycles: 10 // Do 10 cycles
                }
            }
        ];
        // Write default strategies to file
        fs.writeFileSync(strategiesPath, JSON.stringify(swingStrategies, null, 2), 'utf8');
        console.log('Created default swing-strategies.json file');
    }
}
catch (error) {
    console.error('Error loading swing strategies:', error);
    throw new Error('Failed to load swing trading strategies');
}
exports.default = swingStrategies;
