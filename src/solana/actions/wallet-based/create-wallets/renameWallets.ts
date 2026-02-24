import path from "node:path";
import { z } from "zod";

import type { Action } from "../../../../ai/contracts/action";

const protectedRootDirectory = path.join(process.cwd(), "src/ai/brain/protected");
const defaultWalletLibraryPath = "src/ai/brain/protected/wallet-library.jsonl";

const walletPathSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/);

const renameWalletsInputSchema = z.object({
  walletLibraryFile: z.string().min(1).default(defaultWalletLibraryPath),
  updateKeypairFiles: z.boolean().default(true),
  renames: z
    .array(
      z.object({
        from: walletPathSchema,
        to: walletPathSchema,
      }),
    )
    .min(1),
});

type RenameWalletsInput = z.output<typeof renameWalletsInputSchema>;

interface RenameWalletsOutput {
  walletLibraryFilePath: string;
  renamed: Array<{
    from: string;
    to: string;
    keypairFilePath?: string;
    address?: string;
  }>;
}

const toAbsolutePath = (targetPath: string): string =>
  path.isAbsolute(targetPath) ? targetPath : path.join(process.cwd(), targetPath);

const assertWithinProtectedDirectory = (targetPath: string): void => {
  const normalizedTarget = path.resolve(targetPath);
  const normalizedProtectedRoot = path.resolve(protectedRootDirectory);

  if (
    normalizedTarget !== normalizedProtectedRoot &&
    !normalizedTarget.startsWith(`${normalizedProtectedRoot}${path.sep}`)
  ) {
    throw new Error(
      `Wallet files must be stored under ${normalizedProtectedRoot}. Received: ${normalizedTarget}`,
    );
  }
};

const parseWalletPath = (walletPath: string): { group: string; wallet: string } => {
  const [group, wallet] = walletPath.split(".");
  if (!group || !wallet) {
    throw new Error(`Invalid walletPath: ${walletPath}. Expected format group.wallet`);
  }
  return { group, wallet };
};

const toObjectRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Wallet library entry is not an object");
  }
  return { ...(value as Record<string, unknown>) };
};

export const renameWalletsAction: Action<RenameWalletsInput, RenameWalletsOutput> = {
  name: "renameWallets",
  category: "wallet-based",
  inputSchema: renameWalletsInputSchema,
  async execute(_ctx, rawInput) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();

    try {
      const input = renameWalletsInputSchema.parse(rawInput);
      const walletLibraryFilePath = toAbsolutePath(input.walletLibraryFile);
      assertWithinProtectedDirectory(walletLibraryFilePath);

      const libraryFile = Bun.file(walletLibraryFilePath);
      if (!(await libraryFile.exists())) {
        throw new Error(`Wallet library file does not exist: ${walletLibraryFilePath}`);
      }

      const libraryText = await libraryFile.text();
      const libraryLines = libraryText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      if (libraryLines.length === 0) {
        throw new Error(`Wallet library file is empty: ${walletLibraryFilePath}`);
      }

      const entries = libraryLines.map((line, index) => {
        try {
          return toObjectRecord(JSON.parse(line));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`Invalid JSON on wallet library line ${index + 1}: ${message}`);
        }
      });

      const entryIndexByWalletPath = new Map<string, number>();
      entries.forEach((entry, index) => {
        const walletPath = entry.walletPath;
        if (typeof walletPath !== "string" || walletPath.length === 0) {
          throw new Error(`Wallet library line ${index + 1} is missing string field \"walletPath\"`);
        }

        if (entryIndexByWalletPath.has(walletPath)) {
          throw new Error(`Duplicate walletPath in library: ${walletPath}`);
        }
        entryIndexByWalletPath.set(walletPath, index);
      });

      const renamed: RenameWalletsOutput["renamed"] = [];

      for (const rename of input.renames) {
        if (rename.from === rename.to) {
          continue;
        }

        const sourceIndex = entryIndexByWalletPath.get(rename.from);
        if (sourceIndex === undefined) {
          throw new Error(`Cannot rename missing walletPath \"${rename.from}\"`);
        }

        const existingTargetIndex = entryIndexByWalletPath.get(rename.to);
        if (existingTargetIndex !== undefined && existingTargetIndex !== sourceIndex) {
          throw new Error(`Cannot rename \"${rename.from}\" to \"${rename.to}\": target already exists`);
        }

        const entry = entries[sourceIndex] ?? {};
        const next = { ...entry };
        const parsed = parseWalletPath(rename.to);

        next.walletPath = rename.to;
        next.group = parsed.group;
        next.wallet = parsed.wallet;
        next.updatedAt = new Date().toISOString();

        entries[sourceIndex] = next;

        entryIndexByWalletPath.delete(rename.from);
        entryIndexByWalletPath.set(rename.to, sourceIndex);

        const keypairFilePath = typeof next.keypairFilePath === "string" ? next.keypairFilePath : undefined;

        if (input.updateKeypairFiles && keypairFilePath) {
          const absoluteKeypairFilePath = toAbsolutePath(keypairFilePath);
          assertWithinProtectedDirectory(absoluteKeypairFilePath);

          const keypairFile = Bun.file(absoluteKeypairFilePath);
          if (await keypairFile.exists()) {
            const keypairJson = await keypairFile.json();
            if (keypairJson && typeof keypairJson === "object" && !Array.isArray(keypairJson)) {
              const nextKeypair = { ...(keypairJson as Record<string, unknown>) };
              nextKeypair.walletPath = rename.to;
              await Bun.write(absoluteKeypairFilePath, `${JSON.stringify(nextKeypair, null, 2)}\n`);
            }
          }
        }

        renamed.push({
          from: rename.from,
          to: rename.to,
          keypairFilePath,
          address: typeof next.address === "string" ? next.address : undefined,
        });
      }

      const nextLibrary = entries.map((entry) => JSON.stringify(entry)).join("\n");
      await Bun.write(walletLibraryFilePath, `${nextLibrary}\n`);

      return {
        ok: true,
        retryable: false,
        data: {
          walletLibraryFilePath,
          renamed,
        },
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        retryable: false,
        error: message,
        code: "RENAME_WALLETS_FAILED",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }
  },
};
