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
const dotenv = __importStar(require("dotenv"));
const zod_1 = require("zod");
const path = __importStar(require("path"));
// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), 'config', '.env') });
// Define and validate environment variables
const envSchema = zod_1.z.object({
    HELIUS_API_KEY: zod_1.z.string().min(1, 'HELIUS_API_KEY is required'),
    QUICKNODE_API_KEY: zod_1.z.string().min(1, 'QUICKNODE_API_KEY is required'),
    PRIVATE_KEY: zod_1.z.string().min(1, 'PRIVATE_KEY is required'),
});
// Parse environment variables with validation
const env = envSchema.parse({
    HELIUS_API_KEY: process.env.HELIUS_API_KEY,
    QUICKNODE_API_KEY: process.env.QUICKNODE_API_KEY,
    PRIVATE_KEY: process.env.PRIVATE_KEY,
});
// Export the validated env object
exports.default = env;
