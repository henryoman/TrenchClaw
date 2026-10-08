# Solana program interface catalog

The nine interfaces below use the latest official published schema or are generated from the latest official program source. `sources.json` pins each source revision, SHA-256 checksum, format, program address, and download or generation method.

- `bun run idl:check` validates local formats, addresses, and checksums offline.
- `bun run idl:check:upstream` also checks current upstream branch revisions and compares downloaded schemas byte for byte. CI and release validation run this command.
- `bun run idl:update` refreshes every source, generates the Raydium interfaces, validates all results, and then replaces the catalog. Generation requires Cargo, Rust, and tar. Source checkouts and build output stay outside the repository; `CARGO_TARGET_DIR` can select an external build cache.

Set `GITHUB_TOKEN` or `GH_TOKEN` for authenticated GitHub requests when running online checks frequently. CI uses its GitHub token.

Raydium's separate `raydium-idl` repository has not followed the newer CLMM and CPMM program changes. These interfaces are built from their program repositories using `anchor-lang-idl@0.1.4` and locked Cargo dependencies. The generator and its lockfile live in `scripts/idl-builder/`.

| File | Official repository and path | Format | Instructions |
| --- | --- | --- | --- |
| `pump-fun.json` | `pump-fun/pump-public-docs`, `idl/pump.json` | Anchor | 56 |
| `pump-amm.json` | `pump-fun/pump-public-docs`, `idl/pump_amm.json` | Anchor | 38 |
| `pump-fees.json` | `pump-fun/pump-public-docs`, `idl/pump_fees.json` | Anchor | 30 |
| `spl-token.json` | `solana-program/token`, `idl.json` | Codama | 28 |
| `spl-token-2022.json` | `solana-program/token-2022`, `idl.json` | Codama | 100 |
| `jupiter.json` | `jup-ag/rfq-v2-sdk`, `fill-decoder/idls/aggregator.json` | Anchor | 16 |
| `mpl-token-metadata.json` | `metaplex-foundation/mpl-token-metadata`, `trees/codama.json` | Codama | 49 |
| `raydium-clmm.json` | `raydium-io/raydium-clmm`, `programs/amm` | Generated Anchor | 39 |
| `raydium-cpmm.json` | `raydium-io/raydium-cp-swap`, `programs/cp-swap` | Generated Anchor | 20 |

Jupiter's current RFQ SDK schema includes the V2 route instructions absent from its older CPI examples. Metaplex's Codama tree includes resize and account-close instructions and omits some deprecated instructions retained in its Shank schema.

The runtime uses Jupiter REST adapters and Solana Kit signing. These files are repository reference schemas; the runtime does not generate or import clients from them. A current source revision does not prove equivalence to a deployed program binary.
