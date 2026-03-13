# Primary Mode Reference

Primary mode instructions are no longer injected into the live model prompt.

The live prompt now consists of:

1. `src/ai/config/system.md`
2. the generated runtime contract for the current request

Keep this file only as human reference while migrating any remaining guidance into the system kernel or runtime contract.
