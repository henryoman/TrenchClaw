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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.percentageStrategySchema = void 0;
const fs = __importStar(require("fs"));
const zod_1 = require("zod");
const path_1 = __importDefault(require("path"));
/**
 * Schema for percentage-based trading strategies
 * These strategies use a percentage of the wallet's SOL balance for buying,
 * and sell after a percentage of the cycle time has elapsed
 */
exports.percentageStrategySchema = zod_1.z.object({
    swap: zod_1.z.object({
        buyTokenMint: zod_1.z.string(),
        sellTokenMint: zod_1.z.string(),
    }),
    percentage: zod_1.z.object({
        buyPercentage: zod_1.z.number().min(1).max(100).default(90), // Default buy 90% of wallet balance
        sellTimePercentage: zod_1.z.number().min(1).max(99).default(60), // Default sell at 60% of cycle
        cycleSeconds: zod_1.z.number().int().positive(),
        totalCycles: zod_1.z.number().int().positive().optional(),
    }),
});
const strategiesSchema = zod_1.z.array(exports.percentageStrategySchema);
let strategies = [];
try {
    const configPath = path_1.default.resolve(process.cwd(), 'config', 'percentage-strategies.json');
    if (fs.existsSync(configPath)) {
        const fileData = fs.readFileSync(configPath, 'utf8');
        strategies = strategiesSchema.parse(JSON.parse(fileData));
        console.log(`Loaded ${strategies.length} percentage-based trading strategies`);
    }
    else {
        console.log('No percentage-strategies.json file found');
    }
}
catch (error) {
    console.error('Error loading percentage strategies:', error);
    // Continue with empty strategies array
}
exports.default = strategies;
