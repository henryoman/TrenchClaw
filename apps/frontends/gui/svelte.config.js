import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const rootVitePluginSvelteModuleUrl = pathToFileURL(
  path.resolve(process.cwd(), "../../..", "node_modules/@sveltejs/vite-plugin-svelte/src/index.js"),
).href;
const { vitePreprocess } = await import(rootVitePluginSvelteModuleUrl);

export default {
  preprocess: vitePreprocess(),
};
