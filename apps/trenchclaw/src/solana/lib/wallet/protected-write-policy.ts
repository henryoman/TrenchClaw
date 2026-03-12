import path from "node:path";

import type { RuntimeActor } from "../../../ai/runtime/types/context";
import {
  assertModelFilesystemReadAllowed,
  assertModelFilesystemWriteAllowed,
} from "../../../runtime/security/filesystem-manifest";
import {
  RUNTIME_INSTANCE_ROOT,
  RUNTIME_PROTECTED_ROOT,
  RUNTIME_OWNED_ROOT,
  resolveRuntimeContractPath,
} from "../../../runtime/runtime-paths";

const PROTECTED_WRITE_ROOT_DIRECTORIES = [
  RUNTIME_INSTANCE_ROOT,
  RUNTIME_OWNED_ROOT,
  RUNTIME_PROTECTED_ROOT,
] as const;

export class ProtectedWriteForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtectedWriteForbiddenError";
  }
}

export const resolveAbsolutePath = (targetPath: string): string =>
  path.isAbsolute(targetPath) ? targetPath : resolveRuntimeContractPath(targetPath);

export const assertWithinBrainProtectedDirectory = (targetPath: string): void => {
  const normalizedTarget = path.resolve(targetPath);
  const withinProtectedRoots = PROTECTED_WRITE_ROOT_DIRECTORIES.some((rootPath) =>
    normalizedTarget === rootPath || normalizedTarget.startsWith(`${rootPath}${path.sep}`));
  if (!withinProtectedRoots) {
    throw new ProtectedWriteForbiddenError(
      `Protected writes must stay under ${PROTECTED_WRITE_ROOT_DIRECTORIES.join(", ")}. Received: ${normalizedTarget}`,
    );
  }
};

export interface ProtectedWriteRequest {
  actor?: RuntimeActor;
  targetPath: string;
  operation: string;
}

export const assertProtectedWriteAllowed = async (request: ProtectedWriteRequest): Promise<void> => {
  const normalizedTarget = resolveAbsolutePath(request.targetPath);
  assertWithinBrainProtectedDirectory(normalizedTarget);

  await assertModelFilesystemWriteAllowed({
    actor: request.actor,
    targetPath: normalizedTarget,
    reason: request.operation,
  });
};

export interface ProtectedReadRequest {
  actor?: RuntimeActor;
  targetPath: string;
  operation: string;
}

export const assertProtectedReadAllowed = async (request: ProtectedReadRequest): Promise<void> => {
  const normalizedTarget = resolveAbsolutePath(request.targetPath);
  await assertModelFilesystemReadAllowed({
    actor: request.actor,
    targetPath: normalizedTarget,
    reason: request.operation,
  });
};
