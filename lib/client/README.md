# lib/client — Generated TypeScript Clients from Anchor IDLs

This directory holds auto-generated TypeScript clients for on-chain Solana programs that TrenchClaw interacts with.

## How it works

1. Drop the program's Anchor IDL JSON file into `lib/client/idl/`.
2. Run codegen to produce typed TypeScript clients.
3. Actions in `src/solana/actions/` import from `lib/client/` to build and send instructions.

## IDL sources

| Program | IDL file | What it's for |
| --- | --- | --- |
| SPL Token | `spl-token.json` | Token transfers, minting, ATA creation |
| SPL Token 2022 | `spl-token-2022.json` | Token extensions (fees, transfer hooks, metadata pointer) |
| Token Metadata (Metaplex) | `mpl-token-metadata.json` | Token name/symbol/uri metadata |
| Jupiter | `jupiter.json` | Direct CPI into Jupiter (optional, API is primary) |
| Raydium AMM | `raydium-amm.json` | Pool detection for sniper triggers |
| Raydium CLMM | `raydium-clmm.json` | Concentrated liquidity routing/parsing |
| Pump.fun | `pump-fun.json` | Token launch detection |

Current source URLs (fetched to `lib/client/idl/`):

- `https://raw.githubusercontent.com/solana-program/token/main/program/idl.json`
- `https://raw.githubusercontent.com/solana-program/token-2022/main/interface/idl.json`
- `https://raw.githubusercontent.com/metaplex-foundation/mpl-token-metadata/main/idls/token_metadata.json`
- `https://raw.githubusercontent.com/jup-ag/jupiter-cpi/main/idl.json`
- `https://raw.githubusercontent.com/raydium-io/raydium-idl/master/raydium_amm/idl.json`
- `https://raw.githubusercontent.com/raydium-io/raydium-idl/master/raydium_clmm/amm_v3.json`
- `https://raw.githubusercontent.com/streamingfast/substreams-solana-pump-fun/main/idls/program.json`

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
