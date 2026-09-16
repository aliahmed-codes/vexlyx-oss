"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchAPI } from "@/lib/api";
import type { AuditLogListResponse } from "@vexlyx/shared";

export interface AuditLogFilters {
  actorId?: string;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
}

function buildQuery(filters: AuditLogFilters, page: number, pageSize: number): string {
  const params = new URLSearchParams();
  if (filters.actorId) params.set("actorId", filters.actorId);
  if (filters.action) params.set("action", filters.action);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  return params.toString();
}

export function useAuditLog(filters: AuditLogFilters, page: number, pageSize: number) {
  const query = useQuery({
    queryKey: ["audit-log", filters, page, pageSize],
    queryFn: () => fetchAPI<AuditLogListResponse>(`/api/audit-log?${buildQuery(filters, page, pageSize)}`),
  });

  return {
    entries: query.data?.entries ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
  };
}
