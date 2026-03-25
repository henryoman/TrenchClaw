<!--
This file is distributed as dist/AGENTS.md in the published package.
It provides instructions for AI agents using bash-tool in their projects.
The build process copies this file to dist/AGENTS.md (removing this comment).
-->

# AGENTS.md - bash-tool

Instructions for AI agents using bash-tool in projects.

## What is bash-tool?

- Provides `bash`, `readFile`, `writeFile` tools for AI SDK agents
- Runs commands in sandboxed environments (just-bash or @vercel/sandbox)
- Pre-populates sandbox with files from inline content or disk
- Generates contextual LLM instructions with working directory and file list

## TrenchClaw Position

For TrenchClaw, treat shell execution as three separate tiers:

1. trusted internal host execution
   - repo-owned scripts, local dev bootstrap, builds, release automation
   - normal `Bun.spawn` and `bun run` are acceptable here
2. current runtime workspace shell
   - `workspaceBash` in TrenchClaw today
   - useful for inspection and trusted CLI utility work
   - not a true VM or container boundary
3. proper model-exec sandbox
   - the required target for model-driven bash and TypeScript
   - this does not need to be a full VM
   - the preferred default is `just-bash` or another custom `bash-tool`
     sandbox implementation with isolated filesystem, network policy, and
     execution limits

If the goal is "mini isolated bash environments with real limits", do not stop
at command regexes or cwd restrictions. Use a real sandbox backend, but that
backend can be lightweight and in-process rather than a full VM.

## Quick Reference

```typescript
import { createBashTool } from "bash-tool";
import { ToolLoopAgent, stepCountIs } from "ai";

const { tools } = await createBashTool({
  files: {
    "src/index.ts": "export const x = 1;",
    "package.json": '{"name": "test"}',
  },
});

const agent = new ToolLoopAgent({
  model,
  tools,
  // Or use just the bash tool as tools: {bash: tools.bash}
  stopWhen: stepCountIs(20),
});

const result = await agent.generate({
  prompt: "List files in src/",
});
```

## Key Behaviors

1. **Default sandbox is just-bash** - Install `just-bash` or provide your own sandbox
2. **Working directory defaults to `/workspace`** - All files written relative to `destination`
3. **Files are written before tools are returned** - Sandbox is pre-populated
4. **Tool descriptions include file list** - LLM sees available files in bash tool description
5. **No `stop()` method** - Sandbox lifecycle is managed externally

## Recommended Backend Choice

For TrenchClaw, the recommendation is:

- keep host `Bun.spawn` for trusted internal repo scripts
- keep `workspaceReadFile` and `workspaceWriteFile` for exact workspace I/O
- move model-driven bash and TypeScript execution onto a real isolated sandbox
  backend
- prefer typed runtime actions over shell commands whenever a typed action
  already exists

If you use `bash-tool`, prefer a real sandbox backend rather than direct host
execution when any of the following are true:

- you need isolated bash with no direct host shell access
- you need to run TypeScript or JavaScript in a contained environment
- you need timeout control or loop/command-count limits
- you need egress controls or domain allowlists
- you need a stronger boundary against host access or data exfiltration

For TrenchClaw, the default recommendation is:

- use `just-bash` for model-driven shell work
- enable only the specific permissions you need such as network allowlists and
  `js-exec`
- avoid direct host `bun run *.ts` for model work
- keep host passthrough only for explicitly curated native binaries that
  `just-bash` cannot emulate well

## Common Patterns

### Upload local directory

```typescript
const { bash } = await createBashTool({
  uploadDirectory: { source: "./my-project", include: "**/*.ts" },
});
```

### Persistent sandbox across serverless invocations

```typescript
import { Sandbox } from "@vercel/sandbox";

// First invocation: create and store sandboxId
const newSandbox = await Sandbox.create();
const sandboxId = newSandbox.sandboxId; // store this

// Later invocations: reconnect by ID
const existingSandbox = await Sandbox.get({ sandboxId });
const { tools } = await createBashTool({ sandbox: existingSandbox });
// Previous files and state preserved
```

### Intercept bash commands

```typescript
const { tools } = await createBashTool({
  onBeforeBashCall: ({ command }) => {
    console.log("Running:", command);
    return undefined; // Or return { command: modifiedCommand } to change it
  },
  onAfterBashCall: ({ command, result }) => {
    console.log(`Exit: ${result.exitCode}`);
    return undefined; // Or return { result: modifiedResult } to change it
  },
});
```

### Custom destination

```typescript
const { bash } = await createBashTool({
  destination: "/home/user/app",
  files: { "main.ts": "console.log('hi');" },
});
// Files at /home/user/app/main.ts, cwd is /home/user/app
```

## Limitations

- **just-bash is simulated** - Cannot support python, node.js or binaries; use @vercel/sandbox for a full VM. So, createBashTool supports full VMs, it is just the default that does not
- **No persistent state between calls** - Each `createBashTool` starts fresh, but the tool itself has persistence and it can be achieved across serverless function invocations by passing in the same sandbox across `createBashTool` invocations
- **Text files only** - `files` option accepts strings, not buffers
- **No streaming** - Command output returned after completion

## TrenchClaw Policy

- `workspaceBash` should be described as a policy-constrained host shell today,
  not as proper secure exec
- `workspaceBash` is acceptable for read-mostly inspection commands such as
  `pwd`, `rg`, `command -v`, and version checks for trusted CLIs
- exact file writes should go through `workspaceWriteFile`
- exact file reads should go through `workspaceReadFile`
- typed runtime actions should replace shell commands whenever a native action
  exists
- model-driven TypeScript should run through `js-exec` or an equivalent
  contained runtime instead of direct host `bun run`
- arbitrary host bash should not be the default model surface

## What To Standardize Across The Stack

Use one consistent rule set:

- trusted internal automation
  - host execution is fine
- model inspection shell
  - `just-bash` with in-memory or overlay filesystem
  - network off by default or strict URL allowlist
  - execution limits enabled
- model TypeScript or JavaScript execution
  - `just-bash` with `javascript: true` and `js-exec`
  - use its timeout and memory-limited runtime instead of host `bun run`
- native CLI passthrough
  - separate, curated surface for trusted binaries like `solana` or `helius`
  - do not collapse this into general host bash
- only add a full VM backend if you later need arbitrary native binaries,
  stronger isolation, or workloads that outgrow the lightweight path

If a package marketed as "secure exec" does not give you real CPU, memory,
timeout, network, and filesystem isolation, it is not the thing you want here.

## Error Handling

```typescript
const { tools, sandbox } = await createBashTool();

const result = await tools.bash.execute({ command: "ls /nonexistent" });
if (result.exitCode !== 0) {
  console.error("Command failed:", result.stderr);
}

// readFile throws on missing files
try {
  await sandbox.readFile("/missing.txt");
} catch (e) {
  // "File not found: /missing.txt" or "Failed to read file: ..."
}
```

## Debugging Tips

1. **Check sandbox type** - `isVercelSandbox()` and `isJustBash()` exported for detection
2. **Inspect tool description** - `bash.description` shows working dir and file list
3. **Use `pwd` first** - Verify working directory matches expectations
4. **Check `exitCode`** - Non-zero means command failed, check `stderr`
5. **Missing just-bash error** - Install it or provide custom sandbox

## Discovering Types

TypeScript types are available in the `.d.ts` files:

```bash
# View main exports
cat node_modules/bash-tool/dist/index.d.ts

# View all options and types
cat node_modules/bash-tool/dist/types.d.ts

# Search for interfaces
grep -r "^export interface" node_modules/bash-tool/dist/*.d.ts
```

Key types to explore:

- `CreateBashToolOptions` - Options for createBashTool()
- `BashToolkit` - Return type with bash, tools, sandbox
- `Sandbox` - Interface for custom sandbox implementations
- `CommandResult` - Shape of executeCommand results
