import { parseArgs } from "node:util";

import { z } from "zod";

import { bootstrapRuntime } from "../runtime/bootstrap";
import type { RuntimeActor } from "../ai/contracts/types/context";

const runtimeActorSchema = z.enum(["user", "agent", "system"]);
const toolCallEnvelopeSchema = z.object({
  toolName: z.string().trim().min(1),
  input: z.unknown().default({}),
}).passthrough();
const actionCallEnvelopeSchema = z.object({
  actionName: z.string().trim().min(1),
  input: z.unknown().default({}),
}).passthrough();

const executeActionInputSchema = z.object({
  actionName: z.string().trim().min(1).optional(),
  input: z.unknown().optional(),
  actor: runtimeActorSchema.default("agent"),
  idempotencyKey: z.string().trim().min(1).optional(),
  confirm: z.boolean().default(false),
});

export type ExecuteActionInput = z.input<typeof executeActionInputSchema>;

export interface ExecutedActionReport {
  actionName: string;
  input: unknown;
  actor: RuntimeActor;
  result: unknown;
  policyHits: unknown[];
}

const applyManualConfirmation = (payload: unknown): unknown => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  if ("toolName" in payload || "actionName" in payload) {
    const envelope = payload as { input?: unknown };
    if (!envelope.input || typeof envelope.input !== "object" || Array.isArray(envelope.input)) {
      return payload;
    }
    return {
      ...payload,
      input: {
        ...(envelope.input as Record<string, unknown>),
        confirmedByUser: true,
      },
    };
  }

  return {
    ...(payload as Record<string, unknown>),
    confirmedByUser: true,
  };
};

const normalizeActionInvocation = (
  explicitActionName: string | undefined,
  payload: unknown,
): { actionName: string; input: unknown } => {
  const toolCallEnvelope = toolCallEnvelopeSchema.safeParse(payload);
  if (toolCallEnvelope.success) {
    if (explicitActionName && explicitActionName !== toolCallEnvelope.data.toolName) {
      throw new Error(
        `Explicit action name "${explicitActionName}" does not match toolName "${toolCallEnvelope.data.toolName}"`,
      );
    }
    return {
      actionName: toolCallEnvelope.data.toolName,
      input: toolCallEnvelope.data.input,
    };
  }

  const actionEnvelope = actionCallEnvelopeSchema.safeParse(payload);
  if (actionEnvelope.success) {
    if (explicitActionName && explicitActionName !== actionEnvelope.data.actionName) {
      throw new Error(
        `Explicit action name "${explicitActionName}" does not match actionName "${actionEnvelope.data.actionName}"`,
      );
    }
    return {
      actionName: actionEnvelope.data.actionName,
      input: actionEnvelope.data.input,
    };
  }

  if (!explicitActionName) {
    throw new Error(
      "Action name is required unless the JSON payload contains a toolName/actionName envelope.",
    );
  }

  return {
    actionName: explicitActionName,
    input: payload ?? {},
  };
};

const loadJsonPayload = async (inputFilePath: string | undefined, inputJson: string | undefined): Promise<unknown> => {
  if (inputFilePath && inputJson) {
    throw new Error("Provide either --input-file or --input-json, not both.");
  }

  if (inputJson) {
    return JSON.parse(inputJson);
  }

  if (!inputFilePath) {
    return {};
  }

  const file = Bun.file(inputFilePath);
  if (!(await file.exists())) {
    throw new Error(`Input file not found: ${inputFilePath}`);
  }

  return file.json();
};

const applyDefaultRuntimeEnv = (): void => {
  process.env.TRENCHCLAW_PROFILE = process.env.TRENCHCLAW_PROFILE ?? "dangerous";
  process.env.TRENCHCLAW_BOOT_REFRESH_CONTEXT = process.env.TRENCHCLAW_BOOT_REFRESH_CONTEXT ?? "0";
  process.env.TRENCHCLAW_BOOT_REFRESH_KNOWLEDGE = process.env.TRENCHCLAW_BOOT_REFRESH_KNOWLEDGE ?? "0";
};

const withSuppressedConsole = async <T>(operation: () => Promise<T>): Promise<T> => {
  if ((process.env.TRENCHCLAW_ACTION_RUNNER_VERBOSE ?? "").trim() === "1") {
    return operation();
  }

  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };

  console.log = () => {};
  console.info = () => {};
  console.warn = () => {};
  console.error = () => {};

  try {
    return await operation();
  } finally {
    console.log = original.log;
    console.info = original.info;
    console.warn = original.warn;
    console.error = original.error;
  }
};

export const listRegisteredActions = async (): Promise<string[]> => {
  applyDefaultRuntimeEnv();
  const runtime = await withSuppressedConsole(() => bootstrapRuntime());

  try {
    return runtime.registry.list().map((action) => action.name).toSorted();
  } finally {
    await withSuppressedConsole(() => runtime.stop());
  }
};

export const executeAction = async (rawInput: ExecuteActionInput): Promise<ExecutedActionReport> => {
  const input = executeActionInputSchema.parse(rawInput);
  applyDefaultRuntimeEnv();

  const runtime = await withSuppressedConsole(() => bootstrapRuntime());

  try {
    const invocation = normalizeActionInvocation(
      input.actionName,
      input.confirm ? applyManualConfirmation(input.input) : input.input,
    );
    const dispatch = await withSuppressedConsole(() =>
      runtime.dispatcher.dispatchStep(
        runtime.createActionContext({ actor: input.actor }),
        {
          actionName: invocation.actionName,
          input: invocation.input,
          idempotencyKey: input.idempotencyKey,
        },
      ));

    return {
      actionName: invocation.actionName,
      input: invocation.input,
      actor: input.actor,
      result: dispatch.results[0] ?? null,
      policyHits: dispatch.policyHits,
    };
  } finally {
    await withSuppressedConsole(() => runtime.stop());
  }
};

const start = async (): Promise<void> => {
  const parsedArgs = parseArgs({
    args: Bun.argv.slice(2),
    allowPositionals: true,
    options: {
      list: {
        type: "boolean",
      },
      actor: {
        type: "string",
      },
      "input-file": {
        type: "string",
      },
      "input-json": {
        type: "string",
      },
      "idempotency-key": {
        type: "string",
      },
      confirm: {
        type: "boolean",
      },
    },
  });

  if (parsedArgs.values.list) {
    console.log(JSON.stringify(await listRegisteredActions(), null, 2));
    return;
  }

  const payload = await loadJsonPayload(parsedArgs.values["input-file"], parsedArgs.values["input-json"]);
  const result = await executeAction({
    actionName: parsedArgs.positionals[0],
    input: payload,
    actor: parsedArgs.values.actor ? runtimeActorSchema.parse(parsedArgs.values.actor) : undefined,
    idempotencyKey: parsedArgs.values["idempotency-key"],
    confirm: parsedArgs.values.confirm ?? false,
  });

  console.log(JSON.stringify(result, null, 2));

  const actionResult = result.result as { ok?: boolean } | null;
  if (actionResult?.ok === false) {
    process.exitCode = 1;
  }
};

if (import.meta.main) {
  await start();
  process.exit(process.exitCode ?? 0);
}
