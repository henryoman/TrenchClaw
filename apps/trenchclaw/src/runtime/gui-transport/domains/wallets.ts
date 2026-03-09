import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { GuiWalletNodeView, GuiWalletsResponse } from "@trenchclaw/types";
import {
  isWalletLabelFileName,
  resolveWalletKeypairRootRelativePath,
  resolveWalletKeypairRootPath,
} from "../../../solana/actions/wallet-based/create-wallets/wallet-storage";
import type { RuntimeGuiDomainContext } from "../contracts";

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
  const entries = (await readdir(absoluteDirectoryPath, { withFileTypes: true })).toSorted((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) {
      return -1;
    }
    if (!a.isDirectory() && b.isDirectory()) {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });

  const nodes = await Promise.all(
    entries.map(async (entry): Promise<GuiWalletNodeView | null> => {
      const absoluteEntryPath = path.join(absoluteDirectoryPath, entry.name);
      ensureWithinWalletRoot(absoluteRootPath, absoluteEntryPath);
      const relativePath = toPosixPath(path.relative(absoluteRootPath, absoluteEntryPath));

      if (entry.isDirectory()) {
        return {
          name: entry.name,
          relativePath,
          kind: "directory",
          children: await buildWalletTree(absoluteEntryPath, absoluteRootPath),
        };
      }

      if (
        entry.isFile()
        && entry.name.toLowerCase().endsWith(".json")
        && !isWalletLabelFileName(entry.name)
      ) {
        return {
          name: entry.name,
          relativePath,
          kind: "file",
        };
      }

      return null;
    }),
  );

  return nodes.filter((node): node is GuiWalletNodeView => node !== null);
};

const countWalletFiles = (nodes: GuiWalletNodeView[]): number =>
  nodes.reduce((count, node) => {
    if (node.kind === "file") {
      return count + 1;
    }
    return count + countWalletFiles(node.children ?? []);
  }, 0);

export const listWalletTree = async (_context: RuntimeGuiDomainContext): Promise<GuiWalletsResponse> => {
  const absoluteRootPath = resolveWalletKeypairRootPath();
  const rootRelativePath = resolveWalletKeypairRootRelativePath();
  const rootStats = await stat(absoluteRootPath).catch(() => null);
  if (!rootStats || !rootStats.isDirectory()) {
    return {
      rootRelativePath,
      rootExists: false,
      nodes: [],
      walletFileCount: 0,
    };
  }

  const nodes = await buildWalletTree(absoluteRootPath, absoluteRootPath);
  return {
    rootRelativePath,
    rootExists: true,
    nodes,
    walletFileCount: countWalletFiles(nodes),
  };
};

export const readWalletBackupFile = async (
  _context: RuntimeGuiDomainContext,
  relativePathInput: string,
): Promise<{ fileName: string; content: string }> => {
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
