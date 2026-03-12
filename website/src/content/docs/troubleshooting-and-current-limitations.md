---
title: Troubleshooting and Current Limitations
description: Short list of current limits and sharp edges that matter when using the shipped app.
order: 9
---

## Release Limits

- the default packaging script currently targets `darwin-arm64`, `linux-x64`, and `linux-arm64`
- the public installer logic can detect more platforms than the default release pipeline actually builds

## Default Local Ports

- runtime API: `127.0.0.1:4020`
- GUI: `127.0.0.1:4173`

If those ports are occupied, the runner moves upward to the next available local ports.

## Instance Profile Limitation

Switching instances does not fully rebuild the live runtime policy engine. A fresh boot is the safest assumption for full profile application.

## GUI Capability Limits

- no dedicated wallet creation UI
- no dedicated wallet rename UI
- no full runtime settings editor
- many execution flows remain chat- or action-driven

## Runtime Exposure

- the runtime is meant to stay local
- the runtime API exposes sensitive runtime surfaces
- if you bind it off-loopback or proxy it without your own protections, you are expanding trust to anything that can reach it

## Not Shipped

- live trigger execution from timer, price, or on-chain trigger modules
- a broad catalog of production-ready strategy planners
- standard or RPC swap paths as a public supported runtime flow

## Recommended Use

- keep the runtime local
- verify the active instance before touching wallets
- treat vault contents and wallet backup files as sensitive material
- test with devnet or small amounts before relying on more dangerous execution paths
