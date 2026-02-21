import { describe, expect, it } from 'bun:test';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { getKeypair } from './keys';

describe('getKeypair', () => {
  it('parses a base58 secret key', () => {
    const generated = Keypair.generate();
    const encoded = bs58.encode(generated.secretKey);

    const parsed = getKeypair(encoded);

    expect(parsed.publicKey.toBase58()).toBe(generated.publicKey.toBase58());
  });

  it('parses a JSON array secret key', () => {
    const generated = Keypair.generate();
    const json = JSON.stringify(Array.from(generated.secretKey));

    const parsed = getKeypair(json);

    expect(parsed.publicKey.toBase58()).toBe(generated.publicKey.toBase58());
  });

  it('supports test_private_key dev fallback', () => {
    const parsed = getKeypair('test_private_key');

    expect(parsed.secretKey.length).toBe(64);
  });

  it('throws for invalid keys', () => {
    expect(() => getKeypair('not_a_real_private_key')).toThrow('Failed to parse private key');
  });
});
