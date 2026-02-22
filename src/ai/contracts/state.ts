import type { ActionResult } from "./action";
import type { PolicyResult } from "./policy";

export type JobStatus = "pending" | "running" | "paused" | "stopped" | "failed";

export interface JobState {
  id: string;
  botId: string;
  routineName: string;
  status: JobStatus;
  config: Record<string, unknown>;
  nextRunAt?: number;
  lastRunAt?: number;
  cyclesCompleted: number;
  totalCycles?: number;
  lastResult?: ActionResult;
  createdAt: number;
  updatedAt: number;
}

export interface DecisionLog {
  id: string;
  jobId?: string;
  actionName: string;
  trace: string[];
  createdAt: number;
}

export interface PolicyHit {
  id: string;
  actionName: string;
  result: PolicyResult;
  createdAt: number;
}

export interface StateStore {
  saveJob(job: JobState): void;
  getJob(id: string): JobState | null;
  listJobs(filter?: { status?: JobStatus; botId?: string }): JobState[];
  updateJobStatus(id: string, status: JobStatus, meta?: Partial<JobState>): void;
  saveReceipt(receipt: ActionResult): void;
  getReceipt(idempotencyKey: string): ActionResult | null;
  savePolicyHit(hit: PolicyHit): void;
  saveDecisionLog(log: DecisionLog): void;
  getRecentReceipts(limit: number): ActionResult[];
}
