"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchAPI } from "@/lib/api";
import type { DashboardSummaryResponse } from "@vexlyx/shared";

/**
 * Aggregated dashboard-home data (F5.16): stat counts, live server metrics,
 * and a merged recent-activity feed — one request instead of N+1 client calls.
 */
export function useDashboardSummary() {
  const query = useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: () => fetchAPI<DashboardSummaryResponse>("/api/dashboard/summary"),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  return {
    stats: query.data?.stats,
    serverMetrics: query.data?.serverMetrics ?? null,
    activity: query.data?.activity ?? [],
    sslExpiringCount: query.data?.sslExpiringCount ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
