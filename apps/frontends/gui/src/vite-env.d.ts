/// <reference types="vite/client" />
/// <reference types="svelte" />

declare module "*.svelte" {
  import type { ComponentType } from "svelte";
  const component: ComponentType;
  export default component;
}

declare const __TRENCHCLAW_APP_VERSION__: string;
declare const __TRENCHCLAW_APP_COMMIT__: string;
