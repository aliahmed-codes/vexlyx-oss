import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const CleanupStatusSchema = z.enum(["RUNNING", "COMPLETED", "FAILED"]);
export type CleanupStatus = z.infer<typeof CleanupStatusSchema>;

export const CleanupTriggerSchema = z.enum(["SCHEDULED", "MANUAL", "REDEPLOY"]);
export type CleanupTrigger = z.infer<typeof CleanupTriggerSchema>;

// ---------------------------------------------------------------------------
// Disk usage breakdown (GET /api/cleanup/disk-usage)
// ---------------------------------------------------------------------------

export const DiskUsageCategorySchema = z.object({
  type: z.string(),
  total: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  sizeBytes: z.number().nonnegative(),
  reclaimableBytes: z.number().nonnegative(),
});
export type DiskUsageCategory = z.infer<typeof DiskUsageCategorySchema>;

export const DiskUsageResponseSchema = z.object({
  categories: z.array(DiskUsageCategorySchema),
});
export type DiskUsageResponse = z.infer<typeof DiskUsageResponseSchema>;

// ---------------------------------------------------------------------------
// Cleanup run (history row)
// ---------------------------------------------------------------------------

export const CleanupRunSchema = z.object({
  id: z.string(),
  trigger: CleanupTriggerSchema,
  status: CleanupStatusSchema,
  containersRemoved: z.number().int().nonnegative().nullable(),
  imagesRemoved: z.number().int().nonnegative().nullable(),
  reclaimedBytes: z.number().nonnegative().nullable(),
  error: z.string().nullable(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});
export type CleanupRunResponse = z.infer<typeof CleanupRunSchema>;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const CleanupSettingsSchema = z.object({
  scheduleEnabled: z.boolean(),
  scheduleCron: z.string().min(1),
  pruneAfterRedeploy: z.boolean(),
  updatedAt: z.string().datetime(),
});
export type CleanupSettingsResponse = z.infer<typeof CleanupSettingsSchema>;

export const UpdateCleanupSettingsSchema = z.object({
  scheduleEnabled: z.boolean(),
  scheduleCron: z
    .string()
    .min(1)
    // Minimal 5-field cron shape check; full validity left to BullMQ's parser.
    .regex(/^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/, "Must be a 5-field cron expression"),
  pruneAfterRedeploy: z.boolean(),
});
export type UpdateCleanupSettingsInput = z.infer<typeof UpdateCleanupSettingsSchema>;
