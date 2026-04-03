#!/usr/bin/env bun

import assert from "node:assert/strict";

import { createActionContext } from "../apps/trenchclaw/src/ai/contracts/types/context";
import { resolveHeliusRpcConfig } from "../apps/trenchclaw/src/solana/lib/rpc/helius";
import { readManagedWalletLibraryEntries } from "../apps/trenchclaw/src/solana/lib/wallet/walletManager";
import { resolvePrimaryRuntimeEndpoints } from "../apps/trenchclaw/src/runtime/settings/endpoints";
import { loadRuntimeSettings } from "../apps/trenchclaw/src/runtime/settings/runtimeLoader";
import { getTokenRecentBuyersAction } from "../apps/trenchclaw/src/tools/market/tokenHolderAnalytics";
import { getExternalWalletAnalysisAction } from "../apps/trenchclaw/src/tools/wallet/getExternalWalletAnalysis";

const STARTUP_TIMEOUT_MS = 120_000;
const CHAT_TIMEOUT_MS = 90_000;
const SHUTDOWN_TIMEOUT_MS = 8_000;
const PUBLIC_RPC_FALLBACK = "https://api.mainnet-beta.solana.com";
const DEFAULT_WALLET_CANDIDATES = [
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
  "675kPX9MHTjS2zt1qfr1NYHuzefQS8HfQJ79Yv3EGn2Z",
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
] as const;
const DEFAULT_RECENT_BUYER_MINT_CANDIDATES = [
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6f4t5D7N9m3bjsz",
  "So11111111111111111111111111111111111111112",
] as const;
const FALLBACK_CHAT_MODELS = [
  process.env.TRENCHCLAW_WALLET_INTEL_CHAT_MODEL?.trim(),
  "stepfun/step-3.5-flash:free",
  "minimax/minimax-m2.5:free",
  "qwen/qwen3.6-plus-preview:free",
].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);

interface ActionResult<TData> {
  ok: boolean;
  retryable?: boolean;
  error?: string;
  data?: TData;
}

interface ChatSmokeCase {
  id: string;
  prompt: string;
  expectedTools: string[];
  expectedPhrases?: RegExp[];
}

const stripAnsi = (value: string): string => value.replace(/\u001b\[[0-9;]*m/g, "");

const sanitizeRpcUrl = (value: string): string => {
  const parsed = new URL(value);
  parsed.search = "";
  return parsed.toString();
};

const collectSseDataFrames = (payload: string): string[] =>
  payload
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter((line) => line.length > 0 && line !== "[DONE]");

const extractAssistantText = (frames: string[]): string =>
  frames
    .map((frame) => {
      try {
        const parsed = JSON.parse(frame) as { type?: string; delta?: string; text?: string };
        if (parsed.type === "text-delta" && typeof parsed.delta === "string") {
          return parsed.delta;
        }
        if (parsed.type === "text-start" && typeof parsed.text === "string") {
          return parsed.text;
        }
      } catch {
        // Ignore non-text frames.
      }
      return "";
    })
    .join("")
    .trim();

const parseObservedToolNames = (frames: string[]): string[] => {
  const seen = new Set<string>();
  for (const frame of frames) {
    try {
      const parsed = JSON.parse(frame) as { toolName?: string };
      if (typeof parsed.toolName === "string" && parsed.toolName.trim().length > 0) {
        seen.add(parsed.toolName.trim());
      }
    } catch {
      // Ignore non-JSON frames.
    }
  }
  return Array.from(seen).toSorted((left, right) => left.localeCompare(right));
};

const waitForHealth = async (runtimeUrl: string, timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${runtimeUrl}/v1/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Runtime is not ready yet.
    }
    await Bun.sleep(200);
  }
  throw new Error(`Timed out waiting for runtime health at ${runtimeUrl}`);
};

const stopProcess = async (proc: Bun.Subprocess): Promise<void> => {
  if (proc.exitCode !== null || proc.killed) {
    return;
  }

  proc.kill("SIGINT");
  const exited = await Promise.race([
    proc.exited.then(() => true),
    Bun.sleep(SHUTDOWN_TIMEOUT_MS).then(() => false),
  ]);
  if (exited) {
    return;
  }

  if (proc.exitCode === null && !proc.killed) {
    proc.kill("SIGTERM");
  }
  const exitedAfterTerm = await Promise.race([
    proc.exited.then(() => true),
    Bun.sleep(2_000).then(() => false),
  ]);
  if (exitedAfterTerm) {
    return;
  }

  try {
    await Bun.spawn(["pkill", "-f", "apps/runner index.ts"], { stdout: "ignore", stderr: "ignore" }).exited;
  } catch {
    // Best effort only.
  }
  try {
    await Bun.spawn(["pkill", "-f", "src/startRuntimeServer.ts"], { stdout: "ignore", stderr: "ignore" }).exited;
  } catch {
    // Best effort only.
  }

  if (proc.exitCode === null && !proc.killed) {
    proc.kill("SIGKILL");
  }
  await proc.exited;
};

const ensureSuccess = <TData>(label: string, result: ActionResult<TData>): TData => {
  if (!result.ok) {
    throw new Error(`${label} failed: ${result.error ?? "unknown error"}`);
  }
  return result.data as TData;
};

const resolveManualSmokeRpcUrl = async (): Promise<string> => {
  const explicitRpcUrl = process.env.TRENCHCLAW_RPC_URL?.trim() || process.env.RPC_URL?.trim();
  if (explicitRpcUrl) {
    return explicitRpcUrl;
  }

  try {
    const runtimeSettings = await loadRuntimeSettings();
    const runtimeEndpoints = resolvePrimaryRuntimeEndpoints(runtimeSettings);
    const helius = await resolveHeliusRpcConfig({
      rpcUrl: runtimeEndpoints.rpcUrl,
      requireSelectedProvider: false,
    });
    return helius.rpcUrl ?? runtimeEndpoints.rpcUrl;
  } catch {
    return PUBLIC_RPC_FALLBACK;
  }
};

const createAiSettingsOverrideFile = async (model: string): Promise<string> => {
  const filePath = `/tmp/trenchclaw-wallet-intel-chat-ai-${crypto.randomUUID()}.json`;
  await Bun.write(filePath, `${JSON.stringify({
    provider: "openrouter",
    model,
    defaultMode: "primary",
    temperature: null,
    maxOutputTokens: null,
  }, null, 2)}\n`);
  return filePath;
};

const resolveWalletAddress = async (
  ctx: ReturnType<typeof createActionContext>,
): Promise<string> => {
  const explicitAddress = process.env.TRENCHCLAW_WALLET_ANALYSIS_TEST_ADDRESS?.trim();
  const managedWalletCandidates = await readManagedWalletLibraryEntries({ allowMissing: true })
    .then((walletLibrary) => walletLibrary.entries.map((entry) => entry.address))
    .catch(() => []);
  const candidates = [
    ...(explicitAddress ? [explicitAddress] : []),
    ...managedWalletCandidates,
    ...DEFAULT_WALLET_CANDIDATES,
  ].filter((value, index, values) => values.indexOf(value) === index);

  for (const walletAddress of candidates) {
    const result = await getExternalWalletAnalysisAction.execute(ctx, {
      walletAddress,
      tradeLimit: 3,
      includeZeroBalances: false,
      topHoldingsLimit: 3,
    });
    if (
      result.ok
      && result.data
      && result.data.partial === false
      && typeof result.data.liveSolPrice.priceUsd === "number"
      && result.data.holdings.tokenCount > 0
      && (result.data.recentTrades?.returned ?? 0) > 0
    ) {
      return walletAddress;
    }
  }

  throw new Error("Unable to find a live wallet with holdings and recent swaps for wallet-intel chat smoke.");
};

const resolveRecentBuyerMint = async (
  ctx: ReturnType<typeof createActionContext>,
): Promise<string> => {
  const explicitMint = process.env.TRENCHCLAW_TOKEN_RECENT_BUYERS_TEST_MINT?.trim();
  const candidates = [
    ...(explicitMint ? [explicitMint] : []),
    ...DEFAULT_RECENT_BUYER_MINT_CANDIDATES,
  ].filter((value, index, values) => values.indexOf(value) === index);

  for (const mintAddress of candidates) {
    const result = await getTokenRecentBuyersAction.execute(ctx, {
      mintAddress,
      limit: 5,
      recentSwapWindow: 20,
    });
    if (result.ok && (result.data?.returned ?? 0) > 0) {
      return mintAddress;
    }
  }

  throw new Error("Unable to find a live mint with recent buyers for wallet-intel chat smoke.");
};

const readChatResponse = async (
  runtimeUrl: string,
  prompt: string,
): Promise<{ text: string; toolNames: string[] }> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${runtimeUrl}/v1/chat/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chatId: `wallet-intel-chat-${crypto.randomUUID()}`,
        conversationTitle: "wallet intel model smoke",
        messages: [{ role: "user", parts: [{ type: "text", text: prompt }] }],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`Expected /v1/chat/stream 200, got ${response.status}`);
  }

  const bodyText = await response.text();
  if (!bodyText.includes("data:")) {
    throw new Error("Chat stream response did not contain SSE data frames");
  }

  const frames = collectSseDataFrames(bodyText);
  const streamedText = extractAssistantText(frames);
  if (!streamedText) {
    const noEndpointsFrame = frames.find((frame) =>
      frame.includes("No endpoints found")
      || frame.includes("No endpoints available"))
      ?? (bodyText.includes("No endpoints found") || bodyText.includes("No endpoints available") ? bodyText : null);
    if (noEndpointsFrame) {
      throw new Error(`LLM model unavailable for this smoke run: ${noEndpointsFrame}`);
    }
    const blockedFrame = frames.find((frame) => frame.includes("censorship_blocked") || frame.includes("blocked")) ?? (bodyText.includes("censorship_blocked") || bodyText.includes("\"code\":451") ? bodyText : null);
    if (blockedFrame) {
      throw new Error(`LLM model blocked this smoke prompt under provider moderation: ${blockedFrame}`);
    }
    const runtimeErrorFrame = frames.find((frame) => frame.toLowerCase().includes("user not found"));
    if (runtimeErrorFrame) {
      throw new Error(
        [
          "LLM provider auth failed under wallet-intel chat smoke (OpenRouter returned 'User not found').",
          "Update Vault LLM credentials in the GUI secrets panel before relying on this smoke.",
        ].join(" "),
      );
    }
    const rateLimitedFrame = frames.find((frame) =>
      frame.includes("temporarily rate-limited upstream")
      || frame.includes("\"code\":429"))
      ?? (bodyText.includes("temporarily rate-limited upstream") || bodyText.includes("\"code\":429") ? bodyText : null);
    if (rateLimitedFrame) {
      throw new Error(`LLM model rate-limited for this smoke run: ${rateLimitedFrame}`);
    }
    throw new Error("Chat stream did not produce assistant text deltas");
  }

  if (/runtime error:/i.test(streamedText)) {
    throw new Error(`Chat stream returned runtime error text instead of model output: ${streamedText}`);
  }

  return {
    text: streamedText,
    toolNames: parseObservedToolNames(frames),
  };
};

const assertHumanReadable = (label: string, text: string): void => {
  assert.ok(text.length > 0, `${label}: expected non-empty assistant text`);
  assert.equal(/^\s*[{[]/.test(text), false, `${label}: assistant returned raw JSON instead of prose`);
  assert.equal(text.includes("\"analysisScope\""), false, `${label}: assistant leaked raw analysisScope metadata`);
  assert.equal(text.includes("\"topHoldings\""), false, `${label}: assistant leaked raw holdings JSON`);
  assert.equal(text.includes("\"recentBuys\""), false, `${label}: assistant leaked raw recent-buys JSON`);
  assert.equal(
    /^\s*(I'll|I’ll|I will|Let me|I am going to|I'm going to)\b/i.test(text),
    false,
    `${label}: assistant prefaced the answer with tool narration instead of starting with the result`,
  );
};

const shouldRetryWithDifferentModel = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("LLM model unavailable for this smoke run")
    || message.includes("LLM model blocked this smoke prompt under provider moderation")
    || message.includes("User not found")
    || message.includes("LLM model rate-limited for this smoke run");
};

const runSmokeCasesForModel = async (input: {
  smokeCases: ChatSmokeCase[];
  runnerEnv: Record<string, string | undefined>;
}): Promise<void> => {
  const proc = Bun.spawn(["bun", "--cwd", "apps/runner", "index.ts"], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
    env: input.runnerEnv,
  });

  let runtimeUrl: string | null = null;
  const watchOutput = async (
    stream: ReadableStream<Uint8Array> | null,
    sink: Pick<typeof process.stdout, "write">,
  ): Promise<void> => {
    if (!stream) {
      return;
    }
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        const chunk = decoder.decode(value, { stream: true });
        sink.write(chunk);
        const plain = stripAnsi(chunk);
        const match = plain.match(/runtime target:\s*(http:\/\/[^\s]+)/i);
        if (match?.[1]) {
          runtimeUrl = match[1];
        }
      }
    } finally {
      reader.releaseLock();
    }
  };

  const stdoutTask = watchOutput(proc.stdout, process.stdout);
  const stderrTask = watchOutput(proc.stderr, process.stderr);

  try {
    const startupDeadline = Date.now() + STARTUP_TIMEOUT_MS;
    while (!runtimeUrl && Date.now() < startupDeadline) {
      if (proc.exitCode !== null) {
        throw new Error(`launch exited before runtime URL was discovered (exit=${proc.exitCode})`);
      }
      await Bun.sleep(100);
    }
    if (!runtimeUrl) {
      throw new Error("Timed out waiting for launch runtime URL");
    }

    await waitForHealth(runtimeUrl, STARTUP_TIMEOUT_MS);

    for (const smokeCase of input.smokeCases) {
      const result = await readChatResponse(runtimeUrl, smokeCase.prompt);
      for (const expectedTool of smokeCase.expectedTools) {
        assert.ok(
          result.toolNames.includes(expectedTool),
          `[${smokeCase.id}] expected tool ${expectedTool}, saw: ${result.toolNames.join(", ") || "none"}`,
        );
      }
      assertHumanReadable(smokeCase.id, result.text);
      for (const phrase of smokeCase.expectedPhrases ?? []) {
        assert.ok(phrase.test(result.text), `[${smokeCase.id}] expected response to match ${phrase}, got: ${result.text}`);
      }

      console.log(`\n[wallet-intel-chat-smoke] case=${smokeCase.id}`);
      console.log(`[wallet-intel-chat-smoke] tools=${result.toolNames.join(", ") || "none"}`);
      console.log("[wallet-intel-chat-smoke] assistant:");
      console.log(result.text);
    }
  } finally {
    await stopProcess(proc);
    await Promise.allSettled([stdoutTask, stderrTask]);
  }
};

const main = async (): Promise<void> => {
  const rpcUrl = await resolveManualSmokeRpcUrl();
  const ctx = createActionContext({
    actor: "agent",
    rpcUrl,
  });
  const walletAddress = await resolveWalletAddress(ctx);
  const mintAddress = await resolveRecentBuyerMint(ctx);

  console.log(`[wallet-intel-chat-smoke] rpcUrl=${sanitizeRpcUrl(rpcUrl)}`);
  console.log(`[wallet-intel-chat-smoke] walletAddress=${walletAddress}`);
  console.log(`[wallet-intel-chat-smoke] mintAddress=${mintAddress}`);

  const smokeCases: ChatSmokeCase[] = [
    {
      id: "holdings-only",
      prompt: `What does wallet ${walletAddress} hold right now? Only show current holdings, not recent trades.`,
      expectedTools: ["getExternalWalletHoldings"],
      expectedPhrases: [/\bhold/i],
    },
    {
      id: "wallet-analysis",
      prompt: `Analyze wallet ${walletAddress}. I want current holdings and the last few trades.`,
      expectedTools: ["getExternalWalletAnalysis"],
      expectedPhrases: [/\btrade\b|\btrades\b|\bswap\b|\bswaps\b/i, /\bhold/i],
    },
    {
      id: "recent-buyers",
      prompt: `Who are the recent buyers of ${mintAddress}? Summarize who bought recently and what they spent if available.`,
      expectedTools: ["getTokenRecentBuyers"],
      expectedPhrases: [/\bbuyer\b|\bbuyers\b|\bbought\b/i, /\bspent\b|\bsol\b|\busdc\b|\busdt\b/i],
    },
    {
      id: "sol-usd-value",
      prompt: `For wallet ${walletAddress}, what is the current SOL balance and about how much is that worth in USD right now?`,
      expectedTools: ["getExternalWalletHoldings"],
      expectedPhrases: [/\bsol\b/i, /\$|\busd\b/i],
    },
  ];

  const buildProc = Bun.spawn(["bun", "run", "app:build"], {
    cwd: process.cwd(),
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  });
  const buildExit = await buildProc.exited;
  if (buildExit !== 0) {
    throw new Error(`app:build failed with exit code ${buildExit}`);
  }

  let lastError: unknown = null;
  for (const model of FALLBACK_CHAT_MODELS) {
    const aiSettingsFile = await createAiSettingsOverrideFile(model);
    try {
      console.log(`[wallet-intel-chat-smoke] tryingModel=${model}`);
      await runSmokeCasesForModel({
        smokeCases,
        runnerEnv: {
          ...process.env,
          TRENCHCLAW_RUNNER_PROMPT_GUI_LAUNCH: "0",
          TRENCHCLAW_RUNNER_AUTO_OPEN_GUI: "0",
          TRENCHCLAW_AI_SETTINGS_FILE: aiSettingsFile,
        },
      });
      console.log(`\n[wallet-intel-chat-smoke] ok model=${model}`);
      return;
    } catch (error) {
      lastError = error;
      console.log(`[wallet-intel-chat-smoke] model=${model} failed: ${error instanceof Error ? error.message : String(error)}`);
      if (!shouldRetryWithDifferentModel(error)) {
        throw error;
      }
    } finally {
      await Bun.file(aiSettingsFile).delete().catch(() => {});
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "wallet-intel chat smoke failed"));
};

await main();
