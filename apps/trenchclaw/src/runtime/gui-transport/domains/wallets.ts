import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { GuiWalletNodeView, GuiWalletsResponse } from "@trenchclaw/types";
import { WALLET_KEYPAIRS_ROOT, resolveWalletKeypairRootPath } from "../../../solana/actions/wallet-based/create-wallets/wallet-storage";

const toPosixPath = (value: string): string => value.split(path.sep).join("/");

const ensureWithinWalletRoot = (absoluteRootPath: string, absoluteTargetPath: string): void => {
  if (
    absoluteTargetPath !== absoluteRootPath &&
    !absoluteTargetPath.startsWith(`${absoluteRootPath}${path.sep}`)
  ) {
    throw new Error(`Wallet path escapes keypair root: ${absoluteTargetPath}`);
  }
};

const canonicalizeWalletRelativePath = (rawPath: string): string => {
  const normalized = rawPath.replace(/\\/g, "/").trim();
  const withoutLeadingSlash = normalized.replace(/^\/+/u, "");
  const canonical = path.posix.normalize(withoutLeadingSlash);
  if (!canonical || canonical === "." || canonical.includes("..")) {
    throw new Error("Invalid wallet path.");
  }
  return canonical;
};

const buildWalletTree = async (absoluteDirectoryPath: string, absoluteRootPath: string): Promise<GuiWalletNodeView[]> => {
  const entries = await readdir(absoluteDirectoryPath, { withFileTypes: true });
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) {
      return -1;
    }
    if (!a.isDirectory() && b.isDirectory()) {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });

  const nodes: GuiWalletNodeView[] = [];
  for (const entry of entries) {
    const absoluteEntryPath = path.join(absoluteDirectoryPath, entry.name);
    ensureWithinWalletRoot(absoluteRootPath, absoluteEntryPath);
    const relativePath = toPosixPath(path.relative(absoluteRootPath, absoluteEntryPath));

    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        relativePath,
        kind: "directory",
        children: await buildWalletTree(absoluteEntryPath, absoluteRootPath),
      });
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
      nodes.push({
        name: entry.name,
        relativePath,
        kind: "file",
      });
    }
  }

  return nodes;
};

const countWalletFiles = (nodes: GuiWalletNodeView[]): number =>
  nodes.reduce((count, node) => {
    if (node.kind === "file") {
      return count + 1;
    }
    return count + countWalletFiles(node.children ?? []);
  }, 0);

export const listWalletTree = async (): Promise<GuiWalletsResponse> => {
  const absoluteRootPath = resolveWalletKeypairRootPath();
  const rootStats = await stat(absoluteRootPath).catch(() => null);
  if (!rootStats || !rootStats.isDirectory()) {
    return {
      rootRelativePath: WALLET_KEYPAIRS_ROOT,
      rootExists: false,
      nodes: [],
      walletFileCount: 0,
    };
  }

  const nodes = await buildWalletTree(absoluteRootPath, absoluteRootPath);
  return {
    rootRelativePath: WALLET_KEYPAIRS_ROOT,
    rootExists: true,
    nodes,
    walletFileCount: countWalletFiles(nodes),
  };
};

export const readWalletBackupFile = async (relativePathInput: string): Promise<{ fileName: string; content: string }> => {
  const absoluteRootPath = resolveWalletKeypairRootPath();
  const relativePath = canonicalizeWalletRelativePath(relativePathInput);
  const absoluteFilePath = path.resolve(absoluteRootPath, relativePath);
  ensureWithinWalletRoot(absoluteRootPath, absoluteFilePath);

  if (!absoluteFilePath.toLowerCase().endsWith(".json")) {
    throw new Error("Only JSON wallet files can be downloaded.");
  }

  const fileStats = await stat(absoluteFilePath).catch(() => null);
  if (!fileStats || !fileStats.isFile()) {
    throw new Error("Wallet file not found.");
  }

  const content = await Bun.file(absoluteFilePath).text();
  return { fileName: path.basename(absoluteFilePath), content };
};
