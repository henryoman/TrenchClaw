import { mkdirSync } from "node:fs";
import path from "node:path";

import { assertRuntimeSystemWritePath } from "../security/write-scope";
import { resolveRuntimeContractPath } from "../runtime-paths";
import { getLogIoClient, type LogIoClient } from "./log-io-client";

export type StorageWriter = LogIoClient;

export const resolveStoragePath = (targetPath: string): string =>
  path.isAbsolute(targetPath) ? targetPath : resolveRuntimeContractPath(targetPath);

export const resolveStorageChildPath = (directory: string, targetPath: string): string =>
  path.isAbsolute(targetPath) ? targetPath : path.join(directory, targetPath);

export const dateKeyFromIso = (timestampIso: string): string => timestampIso.slice(0, 10);

export const initializeStorageDirectory = (directory: string, operation: string): string => {
  const resolvedDirectory = resolveStoragePath(directory);
  assertRuntimeSystemWritePath(resolvedDirectory, operation);
  mkdirSync(resolvedDirectory, { recursive: true });
  return resolvedDirectory;
};

export const initializeStorageFilePath = (filePath: string, operation: string): string => {
  const resolvedFilePath = resolveStoragePath(filePath);
  assertRuntimeSystemWritePath(resolvedFilePath, operation);
  mkdirSync(path.dirname(resolvedFilePath), { recursive: true });
  return resolvedFilePath;
};

export const ensureWritableStoragePath = (filePath: string, operation: string): string => {
  const resolvedFilePath = resolveStoragePath(filePath);
  assertRuntimeSystemWritePath(resolvedFilePath, operation);
  return resolvedFilePath;
};

export const getStorageWriter = (): StorageWriter => getLogIoClient();

export const appendJsonLine = (
  writer: StorageWriter,
  filePath: string,
  value: unknown,
  operation: string,
): string => {
  const targetFilePath = ensureWritableStoragePath(filePath, operation);
  void writer.appendUtf8(targetFilePath, `${JSON.stringify(value)}\n`);
  return targetFilePath;
};

export const appendJsonLineAsync = async (
  writer: StorageWriter,
  filePath: string,
  value: unknown,
  operation: string,
): Promise<string> => {
  const targetFilePath = ensureWritableStoragePath(filePath, operation);
  await writer.appendUtf8(targetFilePath, `${JSON.stringify(value)}\n`);
  return targetFilePath;
};

export const appendText = (
  writer: StorageWriter,
  filePath: string,
  content: string,
  operation: string,
): string => {
  const targetFilePath = ensureWritableStoragePath(filePath, operation);
  void writer.appendUtf8(targetFilePath, content);
  return targetFilePath;
};

export const writeJsonFile = async (
  writer: StorageWriter,
  filePath: string,
  value: unknown,
  operation: string,
): Promise<string> => {
  const targetFilePath = ensureWritableStoragePath(filePath, operation);
  await writer.writeUtf8(targetFilePath, `${JSON.stringify(value, null, 2)}\n`);
  return targetFilePath;
};
