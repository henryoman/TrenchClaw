declare module "*.svelte" {
  import type { SvelteComponentTyped } from "svelte";

  export default class Component extends SvelteComponentTyped<Record<string, never>, Record<string, never>, Record<string, never>> {}
}
