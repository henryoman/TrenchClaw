import "./styles/base.css";
import "./app.css";
import { mount } from "svelte";
import App from "./App.svelte";

const target = document.getElementById("app");

if (!target) {
  throw new Error('Missing root mount node: element with id "app" was not found.');
}

let app: ReturnType<typeof mount>;

try {
  app = mount(App, { target });
} catch (error) {
  console.error("Failed to mount GUI application:", error);
  target.innerHTML = `
    <main style="min-height:100vh;display:grid;place-items:center;background:#000;color:#ff5f5f;font-family:monospace;padding:16px;">
      <section style="max-width:860px;border:1px solid #ff5f5f;padding:16px;">
        <h1 style="margin:0 0 12px 0;font-size:16px;text-transform:uppercase;">GUI failed to start</h1>
        <p style="margin:0;line-height:1.4;">Open browser devtools console and report the first error line.</p>
      </section>
    </main>
  `;
  throw error;
}

export default app;
