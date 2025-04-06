"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getKeypair = getKeypair;
const web3_js_1 = require("@solana/web3.js");
const bs58_1 = __importDefault(require("bs58"));
/**
 * Parse a private key string into a Solana Keypair
 * @param privateKey - Base58 encoded string or JSON array of numbers
 * @returns Solana Keypair
 */
function getKeypair(privateKey) {
    try {
        try {
            // First try parsing as a JSON array of numbers
            if (privateKey.startsWith('[') && privateKey.endsWith(']')) {
                const secretKeyArray = JSON.parse(privateKey);
                if (Array.isArray(secretKeyArray) && secretKeyArray.length === 64) {
                    return web3_js_1.Keypair.fromSecretKey(Uint8Array.from(secretKeyArray));
                }
            }
            // If it's not a valid JSON array, treat as a base58 encoded key
            try {
                const decodedKey = bs58_1.default.decode(privateKey);
                return web3_js_1.Keypair.fromSecretKey(decodedKey);
            }
            catch (e) {
                // For development/testing, generate a new random keypair
                if (privateKey === 'test_private_key') {
                    console.log('[DEV MODE] Using randomly generated keypair for testing');
                    return web3_js_1.Keypair.generate();
                }
                throw e;
            }
        }
        catch (parseError) {
            // For development/testing, generate a new random keypair
            if (privateKey === 'test_private_key') {
                console.log('[DEV MODE] Using randomly generated keypair for testing');
                return web3_js_1.Keypair.generate();
            }
            throw parseError;
        }
    }
    catch (error) {
        throw new Error(`Failed to parse private key: ${error.message || 'Unknown error'}`);
    }
}
