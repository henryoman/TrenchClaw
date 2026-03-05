import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const runtimeUrl =
  process.env.VITE_TRENCHCLAW_RUNTIME_URL ?? process.env.TRENCHCLAW_RUNTIME_URL ?? "http://127.0.0.1:4020";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const ROOT_PACKAGE_JSON_PATH = path.join(REPO_ROOT, "package.json");
const rootPackageJsonRaw = readFileSync(ROOT_PACKAGE_JSON_PATH, "utf8");
const rootPackageJson = JSON.parse(rootPackageJsonRaw) as { version?: unknown };
const rootPackageVersion =
  typeof rootPackageJson.version === "string" && rootPackageJson.version.trim().length > 0
    ? rootPackageJson.version
    : "0.0.0";

const appVersion = process.env.TRENCHCLAW_BUILD_VERSION?.trim() || `v${rootPackageVersion}`;
const appCommit = process.env.TRENCHCLAW_BUILD_COMMIT?.trim() || "local";

export default defineConfig({
  plugins: [svelte()],
  define: {
    __TRENCHCLAW_APP_VERSION__: JSON.stringify(appVersion),
    __TRENCHCLAW_APP_COMMIT__: JSON.stringify(appCommit),
  },
  server: {
    proxy: {
      "/api": {
        target: runtimeUrl,
        changeOrigin: true,
      },
    },
  },
});
