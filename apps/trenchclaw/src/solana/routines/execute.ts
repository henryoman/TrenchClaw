import { parseArgs } from "node:util";

import { z } from "zod";

import { bootstrapRuntime, type RuntimeBootstrap } from "../../runtime/bootstrap";

const executeRoutineInputSchema = z.object({
  routineName: z.string().trim().min(1),
  botId: z.string().trim().min(1).optional(),
  config: z.record(z.string(), z.unknown()).default({}),
  timeoutMs: z.number().int().positive().max(3_600_000).default(300_000),
});

export type ExecuteRoutineInput = z.infer<typeof executeRoutineInputSchema>;

export const executeRoutine = async (rawInput: ExecuteRoutineInput) => {
  const input = executeRoutineInputSchema.parse(rawInput);

  process.env.TRENCHCLAW_PROFILE = process.env.TRENCHCLAW_PROFILE ?? "dangerous";
  process.env.TRENCHCLAW_BOOT_REFRESH_CONTEXT = process.env.TRENCHCLAW_BOOT_REFRESH_CONTEXT ?? "0";
  process.env.TRENCHCLAW_BOOT_REFRESH_KNOWLEDGE = process.env.TRENCHCLAW_BOOT_REFRESH_KNOWLEDGE ?? "0";

  const runtime = await bootstrapRuntime();

  try {
    const job = await runtime.enqueueJob({
      botId: input.botId ?? `routine:${input.routineName}`,
      routineName: input.routineName,
      config: input.config,
      totalCycles: 1,
    });

    const finalJob = await waitForJobCompletion(runtime, job.id, input.timeoutMs);
    return {
      job: finalJob,
      lastResult: finalJob.lastResult ?? null,
    };
  } finally {
    runtime.stop();
  }
};

const waitForJobCompletion = async (
  runtime: RuntimeBootstrap,
  jobId: string,
  timeoutMs: number,
): Promise<NonNullable<ReturnType<RuntimeBootstrap["stateStore"]["getJob"]>>> => {
  const timeoutAt = Date.now() + timeoutMs;
  const poll = async (): Promise<NonNullable<ReturnType<RuntimeBootstrap["stateStore"]["getJob"]>>> => {
    const job = runtime.stateStore.getJob(jobId);
    if (!job) {
      throw new Error(`Routine job "${jobId}" disappeared before completion`);
    }

    if (job.status === "stopped" || job.status === "failed") {
      return job;
    }

    if (Date.now() >= timeoutAt) {
      throw new Error(`Timed out waiting for routine job "${jobId}" after ${timeoutMs}ms`);
    }

    await Bun.sleep(100);
    return poll();
  };

  return poll();
};

const start = async (): Promise<void> => {
  const parsedArgs = parseArgs({
    args: Bun.argv.slice(2),
    allowPositionals: true,
    options: {
      "bot-id": {
        type: "string",
      },
      "config-file": {
        type: "string",
      },
      "timeout-ms": {
        type: "string",
      },
    },
  });

  const routineName = parsedArgs.positionals[0];
  if (!routineName) {
    throw new Error(
      'Usage: bun run src/solana/routines/execute.ts <routine-name> [--config-file path/to/config.json] [--bot-id my-bot] [--timeout-ms 300000]',
    );
  }

  const config = await loadConfigFile(parsedArgs.values["config-file"]);
  const result = await executeRoutine({
    routineName,
    botId: parsedArgs.values["bot-id"],
    config,
    timeoutMs: parsedArgs.values["timeout-ms"] ? Number(parsedArgs.values["timeout-ms"]) : 300_000,
  });

  console.log(JSON.stringify(result, null, 2));

  if (result.job.status === "failed") {
    process.exitCode = 1;
  }
};

const loadConfigFile = async (configFilePath: string | undefined): Promise<Record<string, unknown>> => {
  if (!configFilePath) {
    return {};
  }

  const file = Bun.file(configFilePath);
  if (!(await file.exists())) {
    throw new Error(`Config file not found: ${configFilePath}`);
  }

  const parsed = await file.json();
  const result = z.record(z.string(), z.unknown()).safeParse(parsed);
  if (!result.success) {
    throw new Error(`Config file must contain a JSON object: ${configFilePath}`);
  }

  return result.data;
};

if (import.meta.main) {
  await start();
}
