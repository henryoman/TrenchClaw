import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT_DIRECTORY = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

const isWithinRoot = (candidatePath: string, rootPath: string): boolean =>
  candidatePath === rootPath || candidatePath.startsWith(`${rootPath}${path.sep}`);

const resolveAbsolutePath = (targetPath: string): string =>
  path.isAbsolute(targetPath) ? path.resolve(targetPath) : path.resolve(APP_ROOT_DIRECTORY, targetPath);

const normalizeRoot = (rootPath: string): string =>
  path.isAbsolute(rootPath) ? path.resolve(rootPath) : path.resolve(APP_ROOT_DIRECTORY, rootPath);

export class WriteScopeViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriteScopeViolationError";
  }
}

export const RUNTIME_SYSTEM_WRITE_ROOTS = [
  "src/ai/brain/db",
] as const;

export const INSTANCE_SYSTEM_WRITE_ROOTS = [
  "src/ai/brain/protected/instance",
] as const;

export const assertWritePathInRoots = (input: {
  targetPath: string;
  roots: readonly string[];
  scope: string;
  operation: string;
}): void => {
  const normalizedTarget = resolveAbsolutePath(input.targetPath);
  const normalizedRoots = input.roots.map(normalizeRoot);
  const isAllowed = normalizedRoots.some((root) => isWithinRoot(normalizedTarget, root));
  if (isAllowed) {
    return;
  }

  throw new WriteScopeViolationError(
    `Blocked ${input.operation}: ${input.scope} path "${normalizedTarget}" is outside allowed roots [${normalizedRoots.join(", ")}]`,
  );
};

export const assertRuntimeSystemWritePath = (targetPath: string, operation: string): void => {
  assertWritePathInRoots({
    targetPath,
    roots: RUNTIME_SYSTEM_WRITE_ROOTS,
    scope: "runtime-system-write",
    operation,
  });
};

export const assertInstanceSystemWritePath = (targetPath: string, operation: string): void => {
  assertWritePathInRoots({
    targetPath,
    roots: INSTANCE_SYSTEM_WRITE_ROOTS,
    scope: "instance-system-write",
    operation,
  });
};

