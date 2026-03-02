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
    <main class="gui-mount-error-shell">
      <section class="gui-mount-error-card">
        <h1>GUI failed to start</h1>
        <p>Open browser devtools console and report the first error line.</p>
      </section>
    </main>
  `;
  throw error;
}

export default app;
