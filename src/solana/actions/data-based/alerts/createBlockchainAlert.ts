import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";

import type { Action } from "../../../../ai/contracts/action";

const createBlockchainAlertInputSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  chain: z.string().min(1).default("solana"),
  assetSymbol: z.string().min(1).max(20),
  condition: z.object({
    type: z.enum(["priceAbove", "priceBelow", "percentChangeUp", "percentChangeDown"]),
    threshold: z.number().positive(),
  }),
  notification: z
    .object({
      channels: z.array(z.enum(["log", "webhook", "email"]).default("log")).min(1).default(["log"]),
      cooldownMinutes: z.number().int().nonnegative().default(0),
    })
    .default({
      channels: ["log"],
      cooldownMinutes: 0,
    }),
  metadata: z
    .object({
      note: z.string().max(500).optional(),
    })
    .optional(),
  storageFilePath: z.string().min(1).default("src/brain/db/alerts/blockchain-alerts.json"),
});

type CreateBlockchainAlertInput = z.output<typeof createBlockchainAlertInputSchema>;

interface BlockchainAlert {
  id: string;
  name: string;
  chain: string;
  assetSymbol: string;
  condition: {
    type: "priceAbove" | "priceBelow" | "percentChangeUp" | "percentChangeDown";
    threshold: number;
  };
  notification: {
    channels: Array<"log" | "webhook" | "email">;
    cooldownMinutes: number;
  };
  metadata?: {
    note?: string;
  };
  status: "active";
  createdAt: number;
  updatedAt: number;
}

interface CreateBlockchainAlertOutput {
  alert: BlockchainAlert;
  storageFilePath: string;
}

const parseStoredAlerts = (content: string): BlockchainAlert[] => {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed as BlockchainAlert[];
  } catch {
    return [];
  }
};

export const createBlockchainAlertAction: Action<CreateBlockchainAlertInput, CreateBlockchainAlertOutput> = {
  name: "createBlockchainAlert",
  category: "data-based",
  inputSchema: createBlockchainAlertInputSchema,
  async execute(_ctx, input) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();

    try {
      const storageFilePath = path.isAbsolute(input.storageFilePath)
        ? input.storageFilePath
        : path.join(process.cwd(), input.storageFilePath);
      const storageDirectory = path.dirname(storageFilePath);
      await mkdir(storageDirectory, { recursive: true });

      let alerts: BlockchainAlert[] = [];
      try {
        const existing = await readFile(storageFilePath, "utf8");
        alerts = parseStoredAlerts(existing);
      } catch {
        alerts = [];
      }

      const now = Date.now();
      const alert: BlockchainAlert = {
        id: crypto.randomUUID(),
        name: input.name?.trim() || `${input.assetSymbol} ${input.condition.type} ${input.condition.threshold}`,
        chain: input.chain,
        assetSymbol: input.assetSymbol.toUpperCase(),
        condition: {
          type: input.condition.type,
          threshold: input.condition.threshold,
        },
        notification: {
          channels: input.notification.channels,
          cooldownMinutes: input.notification.cooldownMinutes,
        },
        metadata: input.metadata,
        status: "active",
        createdAt: now,
        updatedAt: now,
      };

      alerts.push(alert);
      await writeFile(storageFilePath, `${JSON.stringify(alerts, null, 2)}\n`, "utf8");

      return {
        ok: true,
        retryable: false,
        data: {
          alert,
          storageFilePath,
        },
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    } catch (error) {
      return {
        ok: false,
        retryable: false,
        error: error instanceof Error ? error.message : String(error),
        code: "CREATE_BLOCKCHAIN_ALERT_FAILED",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }
  },
};
