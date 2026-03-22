import type { StateStore } from "../../ai/runtime/types/state";
import { getSolPrice } from "../market/sol-price";
import { listUpcomingTradingJobs } from "../trading/upcoming-schedule";

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

const formatUtcExactSecond = (value: number | Date): string => {
  const date = typeof value === "number" ? new Date(value) : value;
  return `${date.toISOString().slice(0, 19).replace("T", " ")} UTC`;
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

const renderUpcomingTradingScheduleSection = (
  stateStore: StateStore | undefined,
  nowUnixMs: number,
): string => {
  if (!stateStore) {
    return [
      "### Upcoming Trading Schedule",
      "- scheduled trading jobs: unavailable",
      "- use `queryRuntimeStore` with `request.type = \"listUpcomingTradingJobs\"` if you need the queued trade schedule",
    ].join("\n");
  }

  const upcomingTradingJobs = listUpcomingTradingJobs(stateStore, {
    limit: 5,
    now: nowUnixMs,
  });

  const lines = [
    "### Upcoming Trading Schedule",
    `- scheduled trading jobs: ${upcomingTradingJobs.length > 0 ? upcomingTradingJobs.length : "none"}`,
    "- use `queryRuntimeStore` with `request.type = \"listUpcomingTradingJobs\"` when the user asks what trades are queued or scheduled",
  ];

  if (upcomingTradingJobs.length === 0) {
    return lines.join("\n");
  }

  const nextJob = upcomingTradingJobs[0]!;
  lines.push(`- next scheduled trade (UTC, exact second): ${formatUtcExactSecond(nextJob.nextRunAt)}`);

  for (const job of upcomingTradingJobs) {
    const serial = job.serialNumber ?? "?";
    const kind = job.kind ?? "trading";
    const summary = job.summary ?? "details unavailable";
    lines.push(`- #${serial} ${job.status} ${kind} at ${formatUtcExactSecond(job.nextRunAt)}: ${summary}`);
  }

  return lines.join("\n");
};

export const renderLiveRuntimeContextSection = async (input?: {
  stateStore?: StateStore;
}): Promise<string> => {
  const now = new Date();
  const nowUnixMs = now.getTime();
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
    "",
    renderUpcomingTradingScheduleSection(input?.stateStore, nowUnixMs),
  ].join("\n");
};
