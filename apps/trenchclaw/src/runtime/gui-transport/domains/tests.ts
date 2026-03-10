import type { RuntimeGuiDomainContext } from "../contracts";
import type { DispatcherTestRequest } from "../parsers";

export const runDispatcherQueueTest = async (
  context: RuntimeGuiDomainContext,
  input: DispatcherTestRequest,
): Promise<{
  jobId: string;
  completed: boolean;
  status: string;
  result: unknown;
}> => {
  const job = await context.runtime.enqueueJob({
    botId: "gui-dispatch-test",
    routineName: "actionSequence",
    config: {
      intervalMs: 60_000,
      steps: [
        {
          key: "ping",
          actionName: "pingRuntime",
          input: {
            message: input.message,
          },
        },
      ],
    },
  });
  context.addActivity("queue", `Dispatcher test enqueued (${job.id})`);

  const finalJob = await context.waitForJobResult(job.id, input.waitMs);
  return {
    jobId: job.id,
    completed: finalJob?.lastResult !== undefined,
    status: finalJob?.status ?? "unknown",
    result: finalJob?.lastResult?.data ?? null,
  };
};
