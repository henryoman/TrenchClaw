import path from "node:path";

import type { RuntimeActor } from "../../../ai/runtime/types/context";
import { assertFilesystemAccessAllowed } from "../../../runtime/security/filesystem-manifest";

const BRAIN_PROTECTED_ROOT_DIRECTORY = path.resolve(process.cwd(), "src/ai/brain/protected");

export class ProtectedWriteForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtectedWriteForbiddenError";
  }
}

export const resolveAbsolutePath = (targetPath: string): string =>
  path.isAbsolute(targetPath) ? targetPath : path.join(process.cwd(), targetPath);

export const assertWithinBrainProtectedDirectory = (targetPath: string): void => {
  const normalizedTarget = path.resolve(targetPath);

  if (
    normalizedTarget !== BRAIN_PROTECTED_ROOT_DIRECTORY &&
    !normalizedTarget.startsWith(`${BRAIN_PROTECTED_ROOT_DIRECTORY}${path.sep}`)
  ) {
    throw new ProtectedWriteForbiddenError(
      `Protected writes must stay under ${BRAIN_PROTECTED_ROOT_DIRECTORY}. Received: ${normalizedTarget}`,
    );
  }
};

export interface ProtectedWriteRequest {
  actor?: RuntimeActor;
  targetPath: string;
  operation: string;
}

export const assertProtectedWriteAllowed = async (request: ProtectedWriteRequest): Promise<void> => {
  const normalizedTarget = path.resolve(request.targetPath);
  assertWithinBrainProtectedDirectory(normalizedTarget);

  await assertFilesystemAccessAllowed({
    actor: request.actor,
    targetPath: normalizedTarget,
    operation: "write",
    reason: request.operation,
  });
};

export interface ProtectedReadRequest {
  actor?: RuntimeActor;
  targetPath: string;
  operation: string;
}

export const assertProtectedReadAllowed = async (request: ProtectedReadRequest): Promise<void> => {
  const normalizedTarget = path.resolve(request.targetPath);
  await assertFilesystemAccessAllowed({
    actor: request.actor,
    targetPath: normalizedTarget,
    operation: "read",
    reason: request.operation,
  });
};
