"use client";

import { Activity, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRefreshAnimation, refreshIconClassName } from "@/hooks/useRefreshAnimation";
import { UsageBar } from "@/components/monitoring/UsageBar";
import type { ServerMetrics } from "@vexlyx/shared";

interface ResourceUsageWidgetProps {
  serverMetrics: ServerMetrics | null;
  isLoading: boolean;
  onRefresh: () => Promise<unknown>;
}

/**
 * Compact server-health snapshot for the dashboard home page (F5.16) — three
 * stacked UsageBar rows (same component as the full /monitoring page), kept
 * deliberately slim rather than the monitoring page's larger circular gauges.
 */
export function ResourceUsageWidget({ serverMetrics, isLoading, onRefresh }: ResourceUsageWidgetProps) {
  const { isRefreshing, refresh } = useRefreshAnimation();

  const handleRefresh = () => refresh(onRefresh);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Server Health
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleRefresh}
          aria-label="Refresh server health"
        >
          <RefreshCw className={refreshIconClassName(isRefreshing, "h-3.5 w-3.5")} />
        </Button>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !serverMetrics ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Server metrics are currently unavailable.
          </p>
        ) : (
          <div className="space-y-3">
            <UsageBar
              label="CPU"
              used={serverMetrics.cpuPercent}
              total={100}
              percent={serverMetrics.cpuPercent}
              caption={null}
            />
            <UsageBar
              label="RAM"
              used={serverMetrics.ramUsed}
              total={serverMetrics.ramTotal}
              percent={serverMetrics.ramPercent}
            />
            <UsageBar
              label="Disk"
              used={serverMetrics.diskUsed}
              total={serverMetrics.diskTotal}
              percent={serverMetrics.diskPercent}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
