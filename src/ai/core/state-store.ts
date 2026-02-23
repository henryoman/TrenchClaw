import type { ActionResult } from "../contracts/action";
import type { DecisionLog, JobState, JobStatus, PolicyHit, StateStore as IStateStore } from "../contracts/state";

export class InMemoryStateStore implements IStateStore {
  private readonly jobs = new Map<string, JobState>();
  private readonly receipts = new Map<string, ActionResult>();
  private readonly policyHits: PolicyHit[] = [];
  private readonly decisionLogs: DecisionLog[] = [];

  saveJob(job: JobState): void {
    this.jobs.set(job.id, { ...job });
  }

  getJob(id: string): JobState | null {
    return this.jobs.get(id) ?? null;
  }

  listJobs(filter?: { status?: JobStatus; botId?: string }): JobState[] {
    let values = Array.from(this.jobs.values());
    if (filter?.status) {
      values = values.filter((job) => job.status === filter.status);
    }
    if (filter?.botId) {
      values = values.filter((job) => job.botId === filter.botId);
    }
    return values;
  }

  updateJobStatus(id: string, status: JobStatus, meta: Partial<JobState> = {}): void {
    const current = this.jobs.get(id);
    if (!current) {
      return;
    }
    this.jobs.set(id, {
      ...current,
      ...meta,
      status,
      updatedAt: Date.now(),
    });
  }

  saveReceipt(receipt: ActionResult): void {
    this.receipts.set(receipt.idempotencyKey, receipt);
  }

  getReceipt(idempotencyKey: string): ActionResult | null {
    return this.receipts.get(idempotencyKey) ?? null;
  }

  savePolicyHit(hit: PolicyHit): void {
    this.policyHits.push(hit);
  }

  saveDecisionLog(log: DecisionLog): void {
    this.decisionLogs.push(log);
  }

  getRecentReceipts(limit: number): ActionResult[] {
    return Array.from(this.receipts.values())
      .toSorted((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }
}
