export interface WelcomeViewOptions {
  version?: string;
  stream?: NodeJS.WriteStream;
  runtimeServerUrl?: string;
}

const ANSI = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  neonTurquoise: "\u001b[38;2;0;245;212m",
  neonPurple: "\u001b[38;2;191;0;255m",
} as const;

const colorize = (value: string, color: keyof typeof ANSI): string =>
  `${ANSI[color]}${value}${ANSI.reset}`;

export const renderWelcomeToTrenchClaw = (
  options: WelcomeViewOptions = {},
) : void => {
  const version = options.version ?? "v0.1.0";
  const stream = options.stream ?? process.stdout;
  const runtimeServerUrl = options.runtimeServerUrl ?? "disabled";

  const lines = [
    `${ANSI.bold}${ANSI.neonTurquoise}TrenchClaw CLI${ANSI.reset} ${colorize(version, "neonPurple")}`,
    "",
    colorize("Minimal Bun CLI bootstrap", "neonPurple"),
    "- Runtime: Bun only",
    "- UI: terminal text only",
    `- Server: ${runtimeServerUrl}`,
    "",
    colorize("Placeholders (coming next)", "neonTurquoise"),
    "- config: load, validate, and save settings",
    "- bots: list, start, pause, resume, stop",
    "- actions: run one-off checks and tasks",
    "- telemetry: basic logs and health status",
    "",
    `${colorize("Accent colors:", "neonPurple")} turquoise + purple`,
  ];

  stream.write(`${lines.join("\n")}\n`);
};
