# lib/client — Generated TypeScript Clients from Anchor IDLs

This directory holds auto-generated TypeScript clients for on-chain Solana programs that TrenchClaw interacts with.

## How it works

1. Drop the program's Anchor IDL JSON file into `lib/client/idl/`.
2. Run codegen to produce typed TypeScript clients.
3. Actions in `src/solana/actions/` import from `lib/client/` to build and send instructions.

## IDL sources

| Program | IDL file | What it's for |
|---|---|---|
| SPL Token | `spl-token.json` | Token transfers, minting, ATA creation |
| Token Metadata (Metaplex) | `mpl-token-metadata.json` | Token name/symbol/uri metadata |
| Jupiter (if needed) | `jupiter.json` | Direct CPI into Jupiter (optional, API is primary) |
| Raydium AMM | `raydium-amm.json` | Pool detection for sniper triggers |
| Pump.fun | `pump-fun.json` | Token launch detection |

## Codegen options

### Option A: Coda (recommended)

```bash
bunx coda generate --idls ./lib/client/idl --output ./lib/client/generated
```

Produces: typed instruction builders, account decoders, PDA helpers, error enums.

### Option B: anchor-client-gen

```bash
bunx anchor-client-gen ./lib/client/idl/program.json ./lib/client/generated/program
```

### Option C: @coral-xyz/anchor native

Import the IDL directly and use `Program` class. Works but less type-safe than codegen.

## Rules

- **Never hand-write instruction builders.** Always generate from IDL.
- **Never commit generated files** (add `lib/client/generated/` to `.gitignore`).
- **IDL JSON files ARE committed.** They're the source of truth.
- **Re-run codegen** after updating any IDL file.
