import { Box, Text, createCliRenderer } from "@opentui/core";

export interface WelcomeViewOptions {
  version?: string;
  jupiterPortalUrl?: string;
  apiKeyEnvName?: string;
}

export const renderWelcomeToTrenchClaw = async (
  options: WelcomeViewOptions = {},
) => {
  const version = options.version ?? "v0.1.0";
  const jupiterPortalUrl = options.jupiterPortalUrl ?? "https://portal.jup.ag";
  const apiKeyEnvName = options.apiKeyEnvName ?? "JUPITER_ULTRA_API_KEY";

  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    useAlternateScreen: true,
  });

  renderer.root.add(
    Box(
      {
        flexDirection: "column",
        borderStyle: "rounded",
        padding: 1,
        gap: 1,
      },
      Text({ content: `Welcome to TrenchClaw ${version}`, fg: "#7CFC98" }),
      Text({ content: "Terminal-first Solana operator runtime." }),
      Text({ content: "" }),
      Text({ content: "Jupiter Ultra Setup", fg: "#8BE9FD" }),
      Text({
        content: `1) Create a universal API key at ${jupiterPortalUrl}`,
      }),
      Text({
        content: `2) Export ${apiKeyEnvName}=<your_key>`,
      }),
      Text({
        content: "3) Ultra flow is API-key based (no custom RPC required for order/execute)",
      }),
      Text({ content: "" }),
      Text({
        content: "Press Ctrl+C to exit this welcome screen.",
        fg: "#A6ACB9",
      }),
    ),
  );

  return renderer;
};
