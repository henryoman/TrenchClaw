---
title: Troubleshooting and Current Limitations
description: Known sharp edges and limitations from the current codebase, documented so operators understand what is shipped, what is partial, and what needs extra caution.
order: 9
---

This page is intentionally blunt. It documents current sharp edges from the codebase rather than smoothing them into marketing copy.

## Installation And Release Limits

- the default packaging script currently targets `darwin-arm64`, `linux-x64`, and `linux-arm64`
- the public installer logic can detect more platforms than the default release pipeline actually builds
- verify release artifacts for your target platform before treating the hosted install path as universal

## Launch And Verification Notes

- the packaged app is best treated as a launcher-first binary
- docs currently recommend `trenchclaw` as the reliable launch command
- the runtime API and GUI are separate local surfaces, not one port

## Current Runtime And GUI Ports

Default local targets are:

- runtime API near `127.0.0.1:4020`
- GUI near `127.0.0.1:4173`

If those ports are occupied, the runner moves upward to the next available local ports.

## Instance Safety Profile Limitation

Choosing or signing into an instance with a different safety profile does not fully hot-rebuild the live runtime policy engine in the current implementation.

Practical takeaway:

- treat a fresh boot as the safest time to assume the selected profile is fully applied

## Instance Recovery Sharp Edge

If the instance profile JSON is missing or unreadable and the runtime falls back to directory-only recovery:

- the recovered entry does not retain the original PIN requirement
- the recovered entry defaults the safety profile to `dangerous`

Do not treat directory-only recovery as equivalent to a healthy instance profile.

## GUI Capability Limits

The current GUI is not a full control panel for every runtime surface.

Notable limits:

- no dedicated wallet creation UI
- no dedicated wallet rename UI
- no full runtime settings editor
- many execution flows remain chat- or action-driven

## Networking And Trust Boundary

By default the runtime is local-only, which is the intended deployment model for current builds.

Still, be aware:

- the runtime API exposes sensitive operator surfaces
- if you bind it off-loopback or proxy it without your own protections, you are expanding trust to anything that can reach it

## Automation Limits

Current public docs should not imply that the product already ships:

- live trigger execution from timer, price, or on-chain trigger modules
- a broad catalog of production-ready strategy planners
- full parity between every named file in the repo and every operator-facing runtime feature

## Swap Surface Limits

- the live documented swap path is the Ultra path
- placeholder standard or RPC swap files exist in the repo, but they are not the public shipped path to document as current capability

## Recommended Operator Posture

- keep the runtime local
- verify the active instance before touching wallets
- treat vault contents and wallet backup files as sensitive material
- test with devnet or small amounts before relying on more dangerous execution paths
