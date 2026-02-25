import path from "node:path";

import type { RuntimeActor } from "../../../ai/contracts/context";

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

export const assertProtectedWriteAllowed = (request: ProtectedWriteRequest): void => {
  const normalizedTarget = path.resolve(request.targetPath);
  assertWithinBrainProtectedDirectory(normalizedTarget);

  if (request.actor === "agent") {
    throw new ProtectedWriteForbiddenError(
      `Blocked ${request.operation}: actor="agent" cannot write protected path "${normalizedTarget}"`,
    );
  }
};

