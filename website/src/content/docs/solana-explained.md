---
title: Solana Explained
description: Practical overview of how Solana works, from accounts and transactions to fees, validators, and finality.
order: 4
---

This page gives you a practical model of Solana so TrenchClaw behavior is easier to reason about.

## High-Level Model

Solana is a high-throughput blockchain optimized for fast confirmation and low-cost transactions.

When you use TrenchClaw:

- your wallet signs a transaction
- transaction is sent to Solana validators
- validators execute instructions in programs (smart contracts)
- final state updates are written on-chain

## Accounts Model (Core Concept)

Solana uses an accounts model:

- data lives in accounts
- programs are accounts too (executable accounts)
- transaction instructions read/write specific accounts

This is why tools often ask for addresses explicitly: execution depends on which accounts are passed in.

## Transactions and Instructions

A transaction can include one or more instructions.

Each instruction targets a specific program and account set.

In practice:

- simple transfer: one main instruction
- complex flow (swap + account setup): multiple instructions in one transaction

## Fees and Compute

Solana transactions pay network fees.

Cost depends on:

- base transaction fee
- compute usage
- optional priority fee (for faster inclusion under load)

If network load is high, priority fees can materially affect landing speed.

## Validators, Consensus, and Time

Solana combines Proof of Stake and Proof of History concepts to order and validate transactions efficiently.

At user level, what matters is:

- transactions are ordered and executed quickly
- confirmation status improves over time (processed -> confirmed -> finalized)
- finalized is the strongest practical confirmation level

## RPC and Why It Matters

You do not query validators directly most of the time. You use an RPC endpoint.

RPC quality affects:

- balance/data freshness
- transaction broadcast reliability
- response latency

If your RPC is unstable, app behavior can look inconsistent even when wallet signing is correct.

## Token Accounts and SOL vs SPL Tokens

SOL is native gas/payment asset of Solana.

Most other assets are SPL tokens and live in token accounts.

So for non-SOL assets, wallet UX usually includes:

- creating token account (if missing)
- reading token account balance
- signing token-program instructions

## Finality and Operational Safety

For operations with financial impact:

1. submit transaction
2. wait for confirmation/finality target
3. verify resulting balances/state
4. only then continue with next dependent action

This avoids cascading mistakes from optimistic assumptions.

## Why This Matters in TrenchClaw

TrenchClaw decisions sit on top of these Solana primitives:

- RPC choice affects data and execution reliability
- fee settings affect speed under contention
- account state drives what instructions can execute

Understanding this layer helps you debug quickly when actions fail.

## References

- Solana Documentation Home: `https://solana.com/docs`
- Solana Core Concepts: `https://solana.com/docs/core`
- Solana Accounts: `https://solana.com/docs/core/accounts`
- Solana Transactions: `https://solana.com/docs/core/transactions`
- Solana Fees: `https://solana.com/docs/core/fees`
- Solana Clusters (devnet/mainnet): `https://solana.com/docs/references/clusters`
- Solana Whitepaper: `https://solana.com/solana-whitepaper.pdf`
