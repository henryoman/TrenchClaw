import {
  RUNTIME_INSTANCE_ROOT,
} from "../runtime-paths";

export const MAX_ACTIVITY_ITEMS = 250;
export const GUI_QUEUE_INCLUDE_HISTORY = process.env.GUI_QUEUE_INCLUDE_HISTORY === "1";
export const ACTIVE_JOB_STATUSES = new Set(["pending", "running", "paused"]);
export const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,accept",
};
export const INSTANCE_DIRECTORY = RUNTIME_INSTANCE_ROOT;
