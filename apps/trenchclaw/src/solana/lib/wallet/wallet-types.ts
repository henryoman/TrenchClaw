import { z } from "zod";

export const DEFAULT_WALLET_GROUP = "core-wallets";
export const WALLET_KEYPAIRS_DIRECTORY_NAME = "keypairs";
export const DEFAULT_WALLET_LIBRARY_FILE_NAME = "wallet-library.jsonl";
export const WALLET_LABEL_FILE_SUFFIX = ".label.json";
export const WALLET_LIBRARY_PATH_ENV = "TRENCHCLAW_WALLET_LIBRARY_FILE";

export const walletGroupNameSchema = z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/);
export const walletNameSchema = z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/);
export const walletIdSchema = z.string().min(1).regex(/^[a-zA-Z0-9_.-]+$/);
export const base58AddressSchema = z.string().trim().min(32).max(44).regex(/^[1-9A-HJ-NP-Za-km-z]+$/);

export interface ManagedWalletRef {
  walletGroup: string;
  walletName: string;
}

export const managedWalletRefSchema = z.object({
  walletGroup: walletGroupNameSchema,
  walletName: walletNameSchema,
});

export interface ManagedWalletLibraryEntry {
  walletId: string;
  walletGroup: string;
  walletName: string;
  address: string;
  keypairFilePath: string;
  walletLabelFilePath: string;
  createdAt: string;
  updatedAt: string;
}

export const managedWalletLibraryEntrySchema = z.object({
  walletId: walletIdSchema,
  walletGroup: walletGroupNameSchema,
  walletName: walletNameSchema,
  address: base58AddressSchema,
  keypairFilePath: z.string().min(1),
  walletLabelFilePath: z.string().min(1),
  createdAt: z.string().min(1).optional().default("1970-01-01T00:00:00.000Z"),
  updatedAt: z.string().min(1).optional().default("1970-01-01T00:00:00.000Z"),
});

export interface WalletLabelFile {
  version: 1;
  walletId: string;
  walletGroup: string;
  walletName: string;
  address: string;
  walletFileName: string;
  createdAt: string;
  updatedAt: string;
}

export const walletLabelFileSchema = z.object({
  version: z.literal(1),
  walletId: walletIdSchema,
  walletGroup: walletGroupNameSchema,
  walletName: walletNameSchema,
  address: base58AddressSchema,
  walletFileName: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export interface ManagedWalletTreeNode {
  name: string;
  relativePath: string;
  kind: "directory" | "file";
  children?: ManagedWalletTreeNode[];
}

export interface ManagedWalletTreeSnapshot {
  rootRelativePath: string;
  rootExists: boolean;
  nodes: ManagedWalletTreeNode[];
  walletFileCount: number;
}

export const toWalletId = (walletGroup: string, walletName: string): string =>
  `${walletGroupNameSchema.parse(walletGroup)}.${walletNameSchema.parse(walletName)}`;
