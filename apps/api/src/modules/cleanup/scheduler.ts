import type { Queue } from "bullmq";

// ---------------------------------------------------------------------------
// Module-level singleton so routes.ts can re-upsert (or remove) the cleanup
// scheduler when settings change, without a circular import. Mirrors
// backups/scheduler.ts, with one difference: cleanup's schedule is opt-in
// (off by default per the AC), so it supports removing the job entirely.
// ---------------------------------------------------------------------------

export const CLEANUP_SCHEDULER_ID = "scheduled-cleanup";

let _cleanupQueue: Queue | null = null;

export function registerCleanupQueue(queue: Queue): void {
  _cleanupQueue = queue;
}

export async function applyCleanupSchedule(
  enabled: boolean,
  cron: string,
  tz: string,
): Promise<void> {
  if (!_cleanupQueue) return;

  if (!enabled) {
    await _cleanupQueue.removeJobScheduler(CLEANUP_SCHEDULER_ID);
    return;
  }

  await _cleanupQueue.upsertJobScheduler(
    CLEANUP_SCHEDULER_ID,
    { pattern: cron, tz },
    { name: "scheduled-cleanup", data: { trigger: "SCHEDULED" } },
  );
}
