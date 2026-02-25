import type { RuntimeActor } from "../../../ai/runtime/types/context";

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
