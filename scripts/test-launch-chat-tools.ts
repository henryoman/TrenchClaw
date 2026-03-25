#!/usr/bin/env bun

import { mkdir, readlink, symlink, unlink } from "node:fs/promises";
import path from "node:path";

import { RUNTIME_INSTANCE_ROOT } from "../apps/trenchclaw/src/runtime/runtimePaths";
import { resolveInstanceToolBinRoot } from "../apps/trenchclaw/src/runtime/instance/paths";

const INSTANCE_ID = "01";
const STARTUP_TIMEOUT_MS = 120_000;
const CHAT_TIMEOUT_MS = 90_000;
const SHUTDOWN_TIMEOUT_MS = 8_000;
const EXPECTED_KNOWLEDGE_TOOLS = ["listKnowledgeDocs", "readKnowledgeDoc"] as const;

const stripAnsi = (value: string): string => value.replace(/\u001b\[[0-9;]*m/g, "");

const collectSseDataFrames = (payload: string): string[] =>
  payload
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter((line) => line.length > 0 && line !== "[DONE]");

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

const ensureToolBinSymlink = async (name: string, target: string): Promise<void> => {
  const toolBin = resolveInstanceToolBinRoot(INSTANCE_ID);
  await mkdir(toolBin, { recursive: true });
  const linkPath = path.join(toolBin, name);
  try {
    const existing = await readlink(linkPath);
    if (existing === target) {
      return;
    }
  } catch {
    // No matching symlink yet.
  }
  try {
    await unlink(linkPath);
  } catch {
    // Ignore missing old symlink.
  }
  await symlink(target, linkPath);
};

const prepareCliSurface = async (): Promise<void> => {
  process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = INSTANCE_ID;
  const solana = Bun.which("solana");
  if (!solana) {
    throw new Error("Need `solana` on PATH for launch chat tool smoke test.");
  }
  await ensureToolBinSymlink("solana", solana);
  const smokeWorkspaceRoot = path.join(RUNTIME_INSTANCE_ROOT, INSTANCE_ID, "workspace", ".launch-chat-tools-smoke");
  await mkdir(smokeWorkspaceRoot, { recursive: true });
};

const parseObservedToolNames = (frames: string[]): Set<string> => {
  const seen = new Set<string>();
  for (const frame of frames) {
    try {
      const parsed = JSON.parse(frame) as { toolName?: string; type?: string };
      if (typeof parsed.toolName === "string" && parsed.toolName.trim().length > 0) {
        seen.add(parsed.toolName.trim());
      }
    } catch {
      // Ignore non-JSON frames.
    }

    if (frame.includes("workspaceBash")) {
      seen.add("workspaceBash");
    }
    for (const toolName of EXPECTED_KNOWLEDGE_TOOLS) {
      if (frame.includes(toolName)) {
        seen.add(toolName);
      }
    }
  }
  return seen;
};

const main = async (): Promise<void> => {
  await prepareCliSurface();

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

  const proc = Bun.spawn(["bun", "--cwd", "apps/runner", "index.ts"], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      TRENCHCLAW_RUNNER_PROMPT_GUI_LAUNCH: "0",
      TRENCHCLAW_RUNNER_AUTO_OPEN_GUI: "0",
    },
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${runtimeUrl}/v1/chat/stream`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chatId: `launch-chat-tools-${crypto.randomUUID()}`,
          conversationTitle: "launch chat tools smoke",
          messages: [{
            role: "user",
            parts: [{
              type: "text",
              text: [
                "Use TrenchClaw knowledge and CLI tools.",
                "Open a knowledge doc about the Solana CLI or shell tooling first.",
                "Then use workspaceBash to run `solana --version`.",
                "Finally summarize the doc title you used and the exact CLI output.",
              ].join(" "),
            }],
          }],
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
    const streamedText = frames
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
          // Ignore invalid JSON frames.
        }
        return "";
      })
      .join("")
      .trim();

    if (!streamedText) {
      const runtimeErrorFrame = frames.find((frame) => frame.toLowerCase().includes("user not found"));
      if (runtimeErrorFrame) {
        throw new Error(
          [
            "LLM provider auth failed under launch chat tool smoke (OpenRouter returned 'User not found').",
            "Update Vault LLM credentials in the GUI secrets panel before relying on this smoke.",
          ].join(" "),
        );
      }
      throw new Error("Chat stream did not produce assistant text deltas");
    }

    if (/runtime error:/i.test(streamedText)) {
      throw new Error(`Chat stream returned runtime error text instead of model output: ${streamedText}`);
    }

    const seenTools = parseObservedToolNames(frames);
    const sawKnowledgeTool = EXPECTED_KNOWLEDGE_TOOLS.some((toolName) => seenTools.has(toolName));
    if (!sawKnowledgeTool) {
      throw new Error(`Expected a knowledge tool call, saw: ${Array.from(seenTools).join(", ") || "none"}`);
    }
    if (!seenTools.has("workspaceBash")) {
      throw new Error(`Expected workspaceBash tool call, saw: ${Array.from(seenTools).join(", ") || "none"}`);
    }
    if (!/solana/i.test(streamedText)) {
      throw new Error(`Expected final response to mention solana CLI output, got: ${streamedText}`);
    }

    console.log("[launch-chat-tools-smoke] observed tools:", Array.from(seenTools).join(", "));
    console.log("[launch-chat-tools-smoke] assistant text:\n");
    console.log(streamedText);
    console.log("\n[launch-chat-tools-smoke] ok");
  } finally {
    await stopProcess(proc);
    await Promise.allSettled([stdoutTask, stderrTask]);
  }
};

await main();
