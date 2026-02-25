import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const runtimeUrl =
  process.env.VITE_TRENCHCLAW_RUNTIME_URL ?? process.env.TRENCHCLAW_RUNTIME_URL ?? "http://127.0.0.1:4020";

export default defineConfig({
  plugins: [svelte()],
  server: {
    proxy: {
      "/api": {
        target: runtimeUrl,
        changeOrigin: true,
      },
    },
  },
});
