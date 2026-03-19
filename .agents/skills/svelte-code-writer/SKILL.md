---
name: svelte-code-writer
description: CLI tools for Svelte 5 documentation lookup and code analysis. MUST be used whenever creating, editing or analyzing any Svelte component (.svelte) or Svelte module (.svelte.ts/.svelte.js). If possible, this skill should be executed within the svelte-file-editor agent for optimal results.
---

# Svelte 5 Code Writer

## CLI Tools

You have access to `@sveltejs/mcp` CLI for Svelte-specific assistance. Use these commands via `bunx`:

### List Documentation Sections

```bash
bunx @sveltejs/mcp list-sections
```

Lists all available Svelte 5 and SvelteKit documentation sections with titles and paths.

### Get Documentation

```bash
bunx @sveltejs/mcp get-documentation "<section1>,<section2>,..."
```

Retrieves full documentation for specified sections. Use after `list-sections` to fetch relevant docs.

**Example:**

```bash
bunx @sveltejs/mcp get-documentation "$state,$derived,$effect"
```

### Validation

Do not use `svelte-autofixer` in this repo.

Use project validation commands instead:

```bash
# GUI workspace
bun run --cwd apps/frontends/gui typecheck
bun run --cwd apps/frontends/gui lint

# Website workspace
bun run --cwd website typecheck
bun run --cwd website lint
```

**Important:** When passing code with runes (`$state`, `$derived`, etc.) via the terminal, escape the `$` character as `\$` to prevent shell variable substitution.

## Workflow

1. **Uncertain about syntax?** Run `list-sections` then `get-documentation` for relevant topics
2. **Reviewing/debugging?** Read the component carefully and use repo lint/typecheck commands
3. **Always validate** - Run the relevant workspace `typecheck` and `lint` commands before finalizing any Svelte component
