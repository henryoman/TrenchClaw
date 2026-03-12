import { appendFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { RuntimeActor } from "../../../ai/runtime/types/context";
import { resolveCurrentActiveInstanceIdSync, resolveInstanceDirectoryPath } from "../../../runtime/instance-state";
import { toRuntimeContractRelativePath } from "../../../runtime/runtime-paths";
import {
  assertWithinBrainProtectedDirectory,
  resolveAbsolutePath,
} from "./protected-write-policy";
import {
  DEFAULT_WALLET_LIBRARY_FILE_NAME,
  WALLET_KEYPAIRS_DIRECTORY_NAME,
  WALLET_LABEL_FILE_SUFFIX,
  WALLET_LIBRARY_PATH_ENV,
  managedWalletLibraryEntrySchema,
  managedWalletRefSchema,
  walletLabelFileSchema,
  walletGroupNameSchema,
  walletNameSchema,
} from "./wallet-types";
import type {
  ManagedWalletLibraryEntry,
  ManagedWalletRef,
  ManagedWalletTreeNode,
  ManagedWalletTreeSnapshot,
  WalletLabelFile,
} from "./wallet-types";

export interface WalletDeleteRequest {
  walletId: string;
  actor: RuntimeActor;
  hard?: boolean;
  userApproved?: boolean;
}

export class WalletDeleteForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletDeleteForbiddenError";
  }
}

export const assertWalletDeletionAllowed = (request: WalletDeleteRequest): void => {
  if (!request.walletId.trim()) {
    throw new WalletDeleteForbiddenError("Wallet deletion requires a wallet id");
  }

  if (request.actor === "agent") {
    throw new WalletDeleteForbiddenError(
      `Wallet deletion is blocked for actor="${request.actor}" (walletId="${request.walletId}")`,
    );
  }

  if (request.actor !== "user") {
    throw new WalletDeleteForbiddenError(
      `Wallet deletion requires actor="user" and explicit approval (received actor="${request.actor}")`,
    );
  }

  if (!request.userApproved) {
    throw new WalletDeleteForbiddenError(
      `Wallet deletion requires explicit user approval (walletId="${request.walletId}")`,
    );
  }
};

const resolveConfiguredWalletLibraryPath = (): string | null => {
  const configuredPath = process.env[WALLET_LIBRARY_PATH_ENV]?.trim();
  return configuredPath && configuredPath.length > 0 ? configuredPath : null;
};

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

const resolveDefaultWalletLibraryFilePath = (): string =>
  path.join(resolveWalletKeypairRootPath(), DEFAULT_WALLET_LIBRARY_FILE_NAME);

const toWalletDisplayName = (fileName: string): string => fileName.replace(/\.json$/iu, "");

const readWalletLabelFile = async (keypairFilePath: string): Promise<WalletLabelFile | null> => {
  const walletLabelFilePath = resolveWalletLabelFilePath(keypairFilePath);
  const walletLabelFile = Bun.file(walletLabelFilePath);
  if (!(await walletLabelFile.exists())) {
    return null;
  }

  try {
    return walletLabelFileSchema.parse(await walletLabelFile.json());
  } catch {
    return null;
  }
};

const readWalletLabelMetadata = async (keypairFilePath: string): Promise<{
  walletId?: string;
  walletName?: string;
  address?: string;
  displayName?: string;
}> => {
  const parsed = await readWalletLabelFile(keypairFilePath);
  if (!parsed) {
    return {
      displayName: toWalletDisplayName(path.basename(keypairFilePath)),
    };
  }

  return {
    walletId: parsed.walletId,
    walletName: parsed.walletName,
    address: parsed.address,
    displayName: parsed.walletName || toWalletDisplayName(parsed.walletFileName),
  };
};

const buildManagedWalletTree = async (
  absoluteDirectoryPath: string,
  absoluteRootPath: string,
): Promise<ManagedWalletTreeNode[]> => {
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
    entries.map(async (entry): Promise<ManagedWalletTreeNode | null> => {
      const absoluteEntryPath = path.join(absoluteDirectoryPath, entry.name);
      ensureWithinWalletRoot(absoluteRootPath, absoluteEntryPath);
      const relativePath = toPosixPath(path.relative(absoluteRootPath, absoluteEntryPath));

      if (entry.isDirectory()) {
        return {
          name: entry.name,
          relativePath,
          kind: "directory",
          children: await buildManagedWalletTree(absoluteEntryPath, absoluteRootPath),
        };
      }

      if (
        entry.isFile() &&
        entry.name.toLowerCase().endsWith(".json") &&
        !isWalletLabelFileName(entry.name)
      ) {
        const metadata = await readWalletLabelMetadata(absoluteEntryPath);
        return {
          name: entry.name,
          relativePath,
          kind: "file",
          displayName: metadata.displayName ?? toWalletDisplayName(entry.name),
          walletName: metadata.walletName,
          walletId: metadata.walletId,
          address: metadata.address,
        };
      }

      return null;
    }),
  );

  return nodes.filter((node): node is ManagedWalletTreeNode => node !== null);
};

const countManagedWalletFiles = (nodes: ManagedWalletTreeNode[]): number =>
  nodes.reduce((count, node) => {
    if (node.kind === "file") {
      return count + 1;
    }
    return count + countManagedWalletFiles(node.children ?? []);
  }, 0);

export const resolveActiveWalletInstanceId = (): string => {
  const instanceId = resolveCurrentActiveInstanceIdSync();
  if (!instanceId) {
    throw new Error("No active instance selected. Sign in before accessing wallets.");
  }
  return instanceId;
};

export const resolveWalletInstanceRootPath = (): string => {
  const absoluteRoot = resolveInstanceDirectoryPath(resolveActiveWalletInstanceId());
  assertWithinBrainProtectedDirectory(absoluteRoot);
  return absoluteRoot;
};

export const resolveWalletKeypairRootPath = (): string => {
  const absoluteRoot = resolveAbsolutePath(path.join(resolveWalletInstanceRootPath(), WALLET_KEYPAIRS_DIRECTORY_NAME));
  assertWithinBrainProtectedDirectory(absoluteRoot);
  return absoluteRoot;
};

export const resolveWalletKeypairRootRelativePath = (): string =>
  toRuntimeContractRelativePath(resolveWalletKeypairRootPath());

export const resolveWalletGroupDirectoryPath = (walletGroup: string): string => {
  const safeGroup = walletGroupNameSchema.parse(walletGroup);
  const absoluteRoot = resolveWalletKeypairRootPath();
  const groupDirectoryPath = path.resolve(absoluteRoot, safeGroup);
  if (groupDirectoryPath !== absoluteRoot && !groupDirectoryPath.startsWith(`${absoluteRoot}${path.sep}`)) {
    throw new Error(`Wallet group path escapes keypair root: ${groupDirectoryPath}`);
  }
  assertWithinBrainProtectedDirectory(groupDirectoryPath);
  return groupDirectoryPath;
};

export const resolveWalletLibraryFilePath = (): string => {
  const absolutePath = resolveAbsolutePath(resolveConfiguredWalletLibraryPath() ?? resolveDefaultWalletLibraryFilePath());
  assertWithinBrainProtectedDirectory(absolutePath);
  return absolutePath;
};

export const resolveWalletKeypairRootPathForInstanceId = (instanceId: string): string => {
  const absoluteRoot = resolveAbsolutePath(path.join(resolveInstanceDirectoryPath(instanceId), WALLET_KEYPAIRS_DIRECTORY_NAME));
  assertWithinBrainProtectedDirectory(absoluteRoot);
  return absoluteRoot;
};

export const isWalletLabelFileName = (fileName: string): boolean =>
  fileName.toLowerCase().endsWith(WALLET_LABEL_FILE_SUFFIX);

export const resolveWalletLabelFilePath = (keypairFilePath: string): string => {
  const absoluteKeypairFilePath = resolveAbsolutePath(keypairFilePath);
  const extension = path.extname(absoluteKeypairFilePath);
  const walletLabelFilePath = extension.length > 0
    ? absoluteKeypairFilePath.slice(0, -extension.length) + WALLET_LABEL_FILE_SUFFIX
    : `${absoluteKeypairFilePath}${WALLET_LABEL_FILE_SUFFIX}`;
  assertWithinBrainProtectedDirectory(walletLabelFilePath);
  return walletLabelFilePath;
};

export const readManagedWalletLibraryEntries = async (input?: {
  filePath?: string;
  allowMissing?: boolean;
  inferFromFilesystem?: boolean;
}): Promise<{
  filePath: string;
  entries: ManagedWalletLibraryEntry[];
  invalidLineCount: number;
}> => {
  const filePath = input?.filePath ?? resolveWalletLibraryFilePath();
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    if (input?.inferFromFilesystem) {
      const keypairRootPath = path.dirname(filePath);
      return {
        filePath,
        entries: await inferManagedWalletLibraryEntriesFromFilesystem({ keypairRootPath }),
        invalidLineCount: 0,
      };
    }
    if (input?.allowMissing) {
      return {
        filePath,
        entries: [],
        invalidLineCount: 0,
      };
    }
    throw new Error(`Wallet library not found: ${filePath}`);
  }

  const entries: ManagedWalletLibraryEntry[] = [];
  let invalidLineCount = 0;
  for (const line of (await file.text()).split(/\r?\n/)) {
    const normalized = line.trim();
    if (!normalized) {
      continue;
    }

    try {
      entries.push(managedWalletLibraryEntrySchema.parse(JSON.parse(normalized)));
    } catch {
      invalidLineCount += 1;
    }
  }

  return {
    filePath,
    entries,
    invalidLineCount,
  };
};

export const inferManagedWalletLibraryEntriesFromFilesystem = async (input?: {
  keypairRootPath?: string;
}): Promise<ManagedWalletLibraryEntry[]> => {
  const absoluteRootPath = input?.keypairRootPath
    ? resolveAbsolutePath(input.keypairRootPath)
    : resolveWalletKeypairRootPath();
  assertWithinBrainProtectedDirectory(absoluteRootPath);
  const rootStats = await stat(absoluteRootPath).catch(() => null);
  if (!rootStats || !rootStats.isDirectory()) {
    return [];
  }

  const entries: ManagedWalletLibraryEntry[] = [];

  const walk = async (directoryPath: string): Promise<void> => {
    const directoryEntries = await readdir(directoryPath, { withFileTypes: true });
    for (const entry of directoryEntries) {
      const absoluteEntryPath = path.join(directoryPath, entry.name);
      ensureWithinWalletRoot(absoluteRootPath, absoluteEntryPath);

      if (entry.isDirectory()) {
        await walk(absoluteEntryPath);
        continue;
      }

      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json") || isWalletLabelFileName(entry.name)) {
        continue;
      }

      const label = await readWalletLabelFile(absoluteEntryPath);
      if (!label) {
        continue;
      }

      entries.push({
        walletId: label.walletId,
        walletGroup: label.walletGroup,
        walletName: label.walletName,
        address: label.address,
        keypairFilePath: absoluteEntryPath,
        walletLabelFilePath: resolveWalletLabelFilePath(absoluteEntryPath),
        createdAt: label.createdAt,
        updatedAt: label.updatedAt,
      });
    }
  };

  await walk(absoluteRootPath);

  return entries
    .toSorted((left, right) => `${left.walletGroup}.${left.walletName}`.localeCompare(`${right.walletGroup}.${right.walletName}`))
    .filter((entry, index, list) => index === 0 || list[index - 1]?.walletId !== entry.walletId);
};

export const findManagedWalletEntry = async (input: ManagedWalletRef): Promise<ManagedWalletLibraryEntry> => {
  const ref = managedWalletRefSchema.parse(input);
  const { entries } = await readManagedWalletLibraryEntries({ inferFromFilesystem: true });
  const entry = entries.find((candidate) =>
    candidate.walletGroup === ref.walletGroup && candidate.walletName === ref.walletName);

  if (!entry) {
    throw new Error(`Managed wallet not found: ${ref.walletGroup}.${ref.walletName}`);
  }

  return entry;
};

export const appendManagedWalletLibraryEntries = async (
  filePath: string,
  entries: ManagedWalletLibraryEntry[],
): Promise<void> => {
  if (entries.length === 0) {
    return;
  }

  entries.forEach((entry) => managedWalletLibraryEntrySchema.parse(entry));
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, { encoding: "utf8" });
};

export const rewriteManagedWalletLibraryEntries = async (
  filePath: string,
  entries: ManagedWalletLibraryEntry[],
): Promise<void> => {
  entries.forEach((entry) => managedWalletLibraryEntrySchema.parse(entry));
  await mkdir(path.dirname(filePath), { recursive: true });
  const content = entries.length > 0 ? `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n` : "";
  await writeFile(filePath, content, "utf8");
};

export const listManagedWalletsByGroup = async (input: {
  walletGroup: string;
  walletNames?: string[];
}): Promise<ManagedWalletLibraryEntry[]> => {
  const walletGroup = walletGroupNameSchema.parse(input.walletGroup);
  const requestedNames = input.walletNames ? new Set(input.walletNames.map((name) => walletNameSchema.parse(name))) : null;
  const { entries } = await readManagedWalletLibraryEntries({ inferFromFilesystem: true });
  return entries.filter((entry) => {
    if (entry.walletGroup !== walletGroup) {
      return false;
    }
    if (requestedNames && !requestedNames.has(entry.walletName)) {
      return false;
    }
    return true;
  });
};

export const listManagedWalletTree = async (): Promise<ManagedWalletTreeSnapshot> => {
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

  const nodes = await buildManagedWalletTree(absoluteRootPath, absoluteRootPath);
  return {
    rootRelativePath,
    rootExists: true,
    nodes,
    walletFileCount: countManagedWalletFiles(nodes),
  };
};

export const readManagedWalletBackupFile = async (relativePathInput: string): Promise<{ fileName: string; content: string }> => {
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

  return {
    fileName: path.basename(absoluteFilePath),
    content: await Bun.file(absoluteFilePath).text(),
  };
};
