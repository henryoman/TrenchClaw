import * as dotenv from 'dotenv';
import { z } from 'zod';
import * as path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), 'config', '.env') });

// Define and validate environment variables
const envSchema = z.object({
  HELIUS_API_KEY: z.string().min(1, 'HELIUS_API_KEY is required'),
  QUICKNODE_API_KEY: z.string().min(1, 'QUICKNODE_API_KEY is required'),
  PRIVATE_KEY: z.string().min(1, 'PRIVATE_KEY is required'),
});

// Parse environment variables with validation
const env = envSchema.parse({
  HELIUS_API_KEY: process.env.HELIUS_API_KEY,
  QUICKNODE_API_KEY: process.env.QUICKNODE_API_KEY,
  PRIVATE_KEY: process.env.PRIVATE_KEY,
});

// Export the validated env object
export default env;