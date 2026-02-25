import { h as head } from "../../chunks/index.js";
function _layout($$renderer, $$props) {
  let { children } = $$props;
  head("12qhfyh", $$renderer, ($$renderer2) => {
    $$renderer2.title(($$renderer3) => {
      $$renderer3.push(`<title>TrenchClaw — Solana Agent Runtime</title>`);
    });
    $$renderer2.push(`<meta name="description" content="High-performance agentic framework and runtime for Solana. Built with @solana/kit, TypeScript, and Bun."/>`);
  });
  children($$renderer);
  $$renderer.push(`<!---->`);
}
export {
  _layout as default
};
