import { describe, expect, test } from "bun:test";
import {
  AccountRole,
  address,
  appendTransactionMessageInstruction,
  blockhash,
  compileTransaction,
  createKeyPairFromPrivateKeyBytes,
  createTransactionMessage,
  getAddressFromPublicKey,
  getBase64EncodedWireTransaction,
  getTransactionDecoder,
  partiallySignTransaction,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";

import { createUltraSignerAdapter } from "../../../../apps/trenchclaw/src/solana/lib/jupiter/ultraSigner";

describe("Jupiter managed swap signer", () => {
  test.each([32, 64])("signs with a %i-byte key while preserving the market maker slot and quoted message", async (keyLength) => {
    const seed = new Uint8Array(32).fill(7);
    const keyPair = await createKeyPairFromPrivateKeyBytes(seed);
    const publicKeyBytes = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
    const privateKey = keyLength === 32 ? seed : new Uint8Array([...seed, ...publicKeyBytes]);
    const signer = await createUltraSignerAdapter({ privateKey });
    const marketMakerKeyPair = await createKeyPairFromPrivateKeyBytes(new Uint8Array(32).fill(8));
    const marketMaker = await getAddressFromPublicKey(marketMakerKeyPair.publicKey);
    const message = appendTransactionMessageInstruction({
      programAddress: address("11111111111111111111111111111111"),
      accounts: [{ address: marketMaker, role: AccountRole.READONLY_SIGNER }],
      data: new Uint8Array(),
    }, setTransactionMessageLifetimeUsingBlockhash({
      blockhash: blockhash("11111111111111111111111111111111"),
      lastValidBlockHeight: 100n,
    }, setTransactionMessageFeePayer(address(signer.address), createTransactionMessage({ version: 0 }))));
    const transaction = compileTransaction(message);

    const signedBase64 = await signer.signBase64Transaction(getBase64EncodedWireTransaction(transaction));
    const signed = getTransactionDecoder().decode(Buffer.from(signedBase64, "base64"));

    expect(signed.messageBytes).toEqual(transaction.messageBytes);
    expect(signed.signatures[address(signer.address)]).not.toBeNull();
    expect(signed.signatures[marketMaker]).toBeNull();
    expect(await crypto.subtle.verify("Ed25519", keyPair.publicKey,
      new Uint8Array(signed.signatures[address(signer.address)]!), new Uint8Array(signed.messageBytes))).toBe(true);

    const marketMakerSigned = await partiallySignTransaction([marketMakerKeyPair], transaction);
    const fullySignedBase64 = await signer.signBase64Transaction(getBase64EncodedWireTransaction(marketMakerSigned));
    const fullySigned = getTransactionDecoder().decode(Buffer.from(fullySignedBase64, "base64"));
    expect(fullySigned.messageBytes).toEqual(transaction.messageBytes);
    expect(fullySigned.signatures[marketMaker]).toEqual(marketMakerSigned.signatures[marketMaker]);
    expect(await crypto.subtle.verify("Ed25519", keyPair.publicKey,
      new Uint8Array(fullySigned.signatures[address(signer.address)]!), new Uint8Array(fullySigned.messageBytes))).toBe(true);
  });
});
