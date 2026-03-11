---
title: Instances and Safety Profiles
description: Create local instances, understand what is stored per instance, and know what the current safety-profile selection does and does not change live.
order: 2
---

TrenchClaw is organized around local instances.

An instance gives you a local identity and a protected directory scope for operator state.

## What An Instance Carries

An instance profile currently stores:

- display name
- local instance id such as `i-01`
- optional local PIN
- selected safety profile
- created and updated timestamps

The runtime also uses the active instance to resolve per-instance protected paths.

## Current Safety Profiles

The shipped profiles are:

- `safe`
- `dangerous`
- `veryDangerous`

The GUI presents them as:

- View only
- Confirm trading
- Allow trading without confirmation

## What Those Profiles Mean

At a high level:

- `safe` blocks wallet-changing and trading behavior
- `dangerous` enables trading paths but keeps confirmation gates for high-impact actions
- `veryDangerous` removes some of those confirmation requirements

## Create An Instance

In the current GUI flow, creating an instance:

1. allocates the next local id such as `i-01`, `i-02`, and so on
2. saves the instance profile JSON
3. marks that instance active
4. clears the current chat selection

You can also set an optional PIN at creation time.

## Sign In To An Existing Instance

Signing into an instance:

- loads that instance as the active instance
- verifies the PIN if the saved profile requires one
- persists the active-instance selection for later restore

## Automatic Restore Behavior

The runtime can restore the active instance from persisted metadata.

There is also a recovery path for directory-only instances:

- if an instance directory exists but the profile JSON is missing, the runtime can still list and restore it
- that recovery path treats the directory name as the instance name

## Important Current Limitation

The selected instance safety profile is stored and exposed in the UI, but the runtime policy engine is built at boot.

That means:

- creating or signing into a different instance does not fully hot-rebuild the live runtime policy surface
- the instance profile is still meaningful metadata
- a fresh app boot is the safest time to assume the selected profile is fully applied

## PIN And Recovery Sharp Edge

The docs should reflect one real sharp edge in current behavior:

- if an instance profile JSON is missing or unreadable and the runtime falls back to directory-only recovery, the recovered entry does not retain the original PIN requirement

Treat instance profile files as important local state rather than disposable metadata.

## What Is Scoped Per Instance

Operator-facing per-instance surfaces include:

- protected instance directory
- managed wallet root
- conversations and conversation history
- instance memory and profile facts

## Practical Guidance

- use separate instances when you want separate local operator contexts
- do not assume instance switching fully hot-swaps every runtime policy at the exact moment of sign-in
- do not rely on directory-only recovery as your normal operating path
