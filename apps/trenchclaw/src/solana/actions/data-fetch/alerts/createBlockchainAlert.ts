import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import type { Action } from "../../../../ai/runtime/types/action";
import {
  assertModelFilesystemReadAllowed,
  assertModelFilesystemWriteAllowed,
} from "../../../../runtime/security/filesystem-manifest";

const alertConditionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("priceAbove"),
    threshold: z.number().positive(),
  }),
  z.object({
    type: z.literal("priceBelow"),
    threshold: z.number().positive(),
  }),
  z.object({
    type: z.literal("changePercentAbove"),
    threshold: z.number().positive(),
    windowMinutes: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal("changePercentBelow"),
    threshold: z.number().positive(),
    windowMinutes: z.number().int().positive().optional(),
  }),
]);

const createBlockchainAlertInputSchema = z.object({
  chain: z.string().trim().min(1).default("solana"),
  assetSymbol: z.string().trim().min(1),
  condition: alertConditionSchema,
  notification: z.object({
    channels: z.array(z.string().trim().min(1)).min(1),
    cooldownMinutes: z.number().int().nonnegative().default(0),
  }),
  storageFilePath: z.string().trim().min(1),
});

type CreateBlockchainAlertInput = z.output<typeof createBlockchainAlertInputSchema>;

interface StoredBlockchainAlert extends CreateBlockchainAlertInput {
  id: string;
  status: "active";
  createdAt: string;
  updatedAt: string;
}

interface CreateBlockchainAlertOutput {
  storageFilePath: string;
  alert: StoredBlockchainAlert;
  alertCount: number;
}

const APP_ROOT_DIRECTORY = path.resolve(fileURLToPath(new URL("../../../..", import.meta.url)));

const readExistingAlerts = async (storageFilePath: string): Promise<StoredBlockchainAlert[]> => {
  try {
    const raw = await readFile(storageFilePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed as StoredBlockchainAlert[];
  } catch (error) {
    const asNodeErr = error as NodeJS.ErrnoException;
    if (asNodeErr?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
};

export const createBlockchainAlertAction: Action<CreateBlockchainAlertInput, CreateBlockchainAlertOutput> = {
  name: "createBlockchainAlert",
  category: "data-based",
  subcategory: "read-only",
  inputSchema: createBlockchainAlertInputSchema,
  async execute(_ctx, rawInput) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();

    try {
      const input = createBlockchainAlertInputSchema.parse(rawInput);
      const now = new Date().toISOString();
      const storageFilePath = path.isAbsolute(input.storageFilePath)
        ? input.storageFilePath
        : path.join(APP_ROOT_DIRECTORY, input.storageFilePath);

      await assertModelFilesystemReadAllowed({
        actor: _ctx.actor,
        targetPath: storageFilePath,
        reason: "read blockchain alert storage file",
      });
      await assertModelFilesystemWriteAllowed({
        actor: _ctx.actor,
        targetPath: storageFilePath,
        reason: "write blockchain alert storage file",
      });

      const existing = await readExistingAlerts(storageFilePath);
      const alert: StoredBlockchainAlert = {
        ...input,
        id: crypto.randomUUID(),
        status: "active",
        createdAt: now,
        updatedAt: now,
      };

      const nextAlerts = [...existing, alert];
      await mkdir(path.dirname(storageFilePath), { recursive: true });
      await writeFile(storageFilePath, JSON.stringify(nextAlerts, null, 2), "utf-8");

      return {
        ok: true,
        retryable: false,
        data: {
          storageFilePath,
          alert,
          alertCount: nextAlerts.length,
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
