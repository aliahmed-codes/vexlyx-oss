"use client";

import Link from "next/link";
import { History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/datetime";
import type { ActivityItem } from "@vexlyx/shared";

interface RecentActivityFeedProps {
  activity: ActivityItem[];
  isLoading: boolean;
}

const STATUS_CLASSNAMES: Record<string, string> = {
  RUNNING: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  ACTIVE: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  COMPLETED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  QUEUED: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  BUILDING: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
  DEPLOYING: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
  EXPIRING_SOON: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  FAILED: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  EXPIRED: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  CANCELLED: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
};

function ActivityBadge({ status }: { status: string }) {
  const className =
    STATUS_CLASSNAMES[status] ??
    "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";

  return (
    <Badge variant="outline" className={cn("shrink-0 text-xs font-medium", className)}>
      {status.replace(/_/g, " ").toLowerCase()}
    </Badge>
  );
}

/**
 * Merged recent-activity feed for the dashboard home page (F5.16):
 * deployments, backups (admin only), and SSL expiry alerts, newest first.
 */
export function RecentActivityFeed({ activity, isLoading }: RecentActivityFeedProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <History className="h-4 w-4 text-muted-foreground" />
          Recent Activity
        </CardTitle>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : activity.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No recent activity</p>
        ) : (
          <div className="divide-y divide-border">
            {activity.map((item) => {
              const row = (
                <div className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    {item.description && (
                      <p className="truncate text-xs text-muted-foreground">{item.description}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(item.timestamp)}
                    </span>
                    <ActivityBadge status={item.status} />
                  </div>
                </div>
              );

              return item.href ? (
                <Link
                  key={item.id}
                  href={item.href}
                  className="block rounded-md transition-colors hover:bg-accent/50"
                >
                  {row}
                </Link>
              ) : (
                <div key={item.id}>{row}</div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
