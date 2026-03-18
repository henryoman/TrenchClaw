import { getSolPrice } from "../market/sol-price";

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatUtcExactMinute = (value: number | Date): string => {
  const date = typeof value === "number" ? new Date(value) : value;
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
};

const formatLocalExactMinute = (date: Date): string => {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const formatted = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(date);
  return `${formatted}${timeZone ? ` (${timeZone})` : ""}`;
};

export const renderLiveRuntimeContextSection = async (): Promise<string> => {
  const now = new Date();
  const solPrice = await getSolPrice().catch(() => ({ priceUsd: null, updatedAt: null }));

  return [
    "## Live Runtime Context",
    "### Clock",
    `- current time (UTC, exact minute): ${formatUtcExactMinute(now)}`,
    `- current time (local, exact minute): ${formatLocalExactMinute(now)}`,
    "- treat words like `now`, `today`, `tonight`, `this morning`, and `recent` using this clock instead of guessing from pretraining",
    "",
    "### Market Snapshot",
    typeof solPrice.priceUsd === "number" && Number.isFinite(solPrice.priceUsd)
      ? `- shared backend SOL/USD snapshot: ${usdFormatter.format(solPrice.priceUsd)}`
      : "- shared backend SOL/USD snapshot: unavailable right now",
    typeof solPrice.updatedAt === "number"
      ? `- SOL snapshot updated at (UTC exact minute): ${formatUtcExactMinute(solPrice.updatedAt)}`
      : "- SOL snapshot updated at (UTC exact minute): unavailable",
    "- this SOL snapshot comes from the same backend cache the GUI uses",
    "- if the user needs a broader market read, another token, or deeper pair detail, use the enabled Dexscreener tools",
  ].join("\n");
};
