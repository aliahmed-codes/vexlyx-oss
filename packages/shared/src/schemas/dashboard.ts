import { z } from "zod";
import { ServerMetricsSchema } from "./monitoring.js";

// ---------------------------------------------------------------------------
// Stat counts (GET /api/dashboard/summary)
// ---------------------------------------------------------------------------

export const DashboardQuotaStatSchema = z.object({
  used: z.number().int().nonnegative(),
  /** null means unlimited — no quota configured for this resource. */
  limit: z.number().int().nonnegative().nullable(),
});
export type DashboardQuotaStat = z.infer<typeof DashboardQuotaStatSchema>;

export const DashboardStatsSchema = z.object({
  projects: DashboardQuotaStatSchema,
  domains: DashboardQuotaStatSchema,
  databases: DashboardQuotaStatSchema,
  mailboxes: DashboardQuotaStatSchema,
});
export type DashboardStats = z.infer<typeof DashboardStatsSchema>;

// ---------------------------------------------------------------------------
// Recent activity feed
// ---------------------------------------------------------------------------

export const ActivityTypeSchema = z.enum(["deployment", "backup", "ssl_alert"]);
export type ActivityType = z.infer<typeof ActivityTypeSchema>;

export const ActivityItemSchema = z.object({
  id: z.string(),
  type: ActivityTypeSchema,
  title: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  timestamp: z.string().datetime(),
  href: z.string().nullable(),
});
export type ActivityItem = z.infer<typeof ActivityItemSchema>;

// ---------------------------------------------------------------------------
// Summary response
// ---------------------------------------------------------------------------

export const DashboardSummaryResponseSchema = z.object({
  stats: DashboardStatsSchema,
  serverMetrics: ServerMetricsSchema.nullable(),
  activity: z.array(ActivityItemSchema),
  /** Count of the caller's own domains with a certificate expiring soon or expired. */
  sslExpiringCount: z.number().int().nonnegative(),
});
export type DashboardSummaryResponse = z.infer<typeof DashboardSummaryResponseSchema>;
