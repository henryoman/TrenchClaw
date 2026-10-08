# Solana program interface catalog

This catalog stores official Anchor IDLs and Codama trees for program interface reference. `sources.json` records each file's official repository, path, immutable revision, SHA-256 checksum, format, and program address.

Run `bun run idl:update` to resolve current upstream branch revisions, download their schemas, and validate them before replacing catalog files. Run `bun run idl:check` for offline format, instruction, program address, and checksum verification. Both CI and the release workflow run this check.

The runtime uses Jupiter REST adapters and Solana Kit signing. It does not currently generate or import clients from these files. Updating this catalog does not enable direct protocol trading or establish that an upstream revision matches every deployed program upgrade.

| File | Official source | Format |
| --- | --- | --- |
| `pump-fun.json` | `pump-fun/pump-public-docs`, `idl/pump.json` | Anchor |
| `pump-amm.json` | `pump-fun/pump-public-docs`, `idl/pump_amm.json` | Anchor |
| `pump-fees.json` | `pump-fun/pump-public-docs`, `idl/pump_fees.json` | Anchor |
| `spl-token.json` | `solana-program/token`, `idl.json` | Codama |
| `spl-token-2022.json` | `solana-program/token-2022`, `idl.json` | Codama |
| `jupiter.json` | `jup-ag/rfq-v2-sdk`, `fill-decoder/idls/aggregator.json` | Anchor |
| `mpl-token-metadata.json` | `metaplex-foundation/mpl-token-metadata`, `trees/codama.json` | Codama |
| `raydium-clmm.json` | `raydium-io/raydium-idl`, `raydium_clmm/raydium_clmm.json` | Anchor |
| `raydium-cpmm.json` | `raydium-io/raydium-idl`, `raydium_cpmm/raydium_cp_swap.json` | Anchor |
