/**
 * Archived experimental transfer example moved out of runtime sources.
 * This file is intentionally not part of `src/**` so it does not affect production typechecks.
 */

import {
  address,
  appendTransactionMessageInstruction,
  assertIsSendableTransaction,
  assertIsTransactionWithBlockhashLifetime,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  getSignatureFromTransaction,
  isSolanaError,
  lamports,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
} from "@solana/kit";
import { getSystemErrorMessage, getTransferSolInstruction, isSystemError } from "@solana-program/system";

const log = {
  error: (message: string, detail?: string): void => {
    console.error(message, detail ?? "");
  },
};
const pressAnyKeyPrompt = async (_message: string): Promise<void> => {};

const SOURCE_ACCOUNT_SIGNER = await createKeyPairSignerFromBytes(
  new Uint8Array(
    [2, 194, 94, 194, 31, 15, 34, 248, 159, 9, 59, 156, 194, 152, 79, 148, 81, 17, 63, 53, 245, 175, 37, 0, 134, 90, 111, 236, 245, 160, 3, 50, 196, 59, 123, 60, 59, 151, 65, 255, 27, 247, 241, 230, 52, 54, 143, 136, 108, 160, 7, 128, 4, 14, 232, 119, 234, 61, 47, 158, 9, 241, 48, 140],
  ),
);
const DESTINATION_ACCOUNT_ADDRESS = address("GdG9JHTSWBChvf6dfBATEYCZbDwKtcC6tJEpqoyuVfqV");

const rpc = createSolanaRpc("http://127.0.0.1:8899");
const rpcSubscriptions = createSolanaRpcSubscriptions("ws://127.0.0.1:8900");
const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

const transactionMessage = pipe(
  createTransactionMessage({ version: 0 }),
  (tx) => setTransactionMessageFeePayer(SOURCE_ACCOUNT_SIGNER.address, tx),
  (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
  (tx) =>
    appendTransactionMessageInstruction(
      getTransferSolInstruction({
        amount: lamports(1_000_000n),
        destination: DESTINATION_ACCOUNT_ADDRESS,
        source: SOURCE_ACCOUNT_SIGNER,
      }),
      tx,
    ),
);

const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);

try {
  assertIsSendableTransaction(signedTransaction);
  assertIsTransactionWithBlockhashLifetime(signedTransaction);
  await sendAndConfirmTransaction(signedTransaction, { commitment: "confirmed" });
  await pressAnyKeyPrompt("Press any key to quit");
} catch (e) {
  if (isSolanaError(e, SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE)) {
    const errorDetailMessage = isSystemError(e.cause, transactionMessage)
      ? getSystemErrorMessage(e.cause.context.code)
      : e.cause?.message;
    log.error("%s", errorDetailMessage ?? "preflight failed");
  } else {
    throw e;
  }
}

console.log("Transaction Signature:", getSignatureFromTransaction(signedTransaction));

