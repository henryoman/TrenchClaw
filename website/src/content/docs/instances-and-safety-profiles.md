---
title: Instances and Safety Profiles
description: Create instances, sign in, and understand what safety profiles mean in the current app.
order: 2
---

## What An Instance Stores

- name
- two-digit instance id such as `01`
- optional PIN
- safety profile

## Safety Profiles

Available profiles:

- `safe`
- `dangerous`
- `veryDangerous`

GUI labels:

- View only
- Confirm trading
- Allow trading without confirmation

## Meaning

- `safe` blocks wallet-changing and trading behavior
- `dangerous` enables trading paths but keeps confirmation gates for high-impact actions
- `veryDangerous` removes some of those confirmation requirements

## Create An Instance

Creating an instance:

1. allocates the next local id
2. saves the instance profile JSON
3. makes that instance active
4. resets the active chat

## Sign In To An Existing Instance

- loads the instance as active
- checks the PIN when required
- persists the active-instance selection

## Restore Behavior

TrenchClaw can restore the active instance from saved metadata.

There is also a directory-only recovery path:

- if an instance directory exists but the profile JSON is missing, the runtime can still list and restore it
- that recovery path treats the directory name as the instance name

## Current Limitation

The selected safety profile is stored on the instance, but the live runtime policy engine is built at boot.

- switching instances does not fully rebuild the live runtime policy surface
- the safest assumption is that a fresh boot fully applies the selected profile

## Per-Instance Scope

- protected instance directory
- managed wallet root
- conversations
- instance memory and profile facts

## Notes

- use separate instances when you want separate local contexts
- keep the instance profile JSON intact
- do not treat directory-only recovery as a normal workflow
