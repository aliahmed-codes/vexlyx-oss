"use client";

import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  DiskUsageResponse,
  CleanupSettingsResponse,
  UpdateCleanupSettingsInput,
  CleanupRunResponse,
} from "@vexlyx/shared";

// ---------------------------------------------------------------------------
// API client helpers
// ---------------------------------------------------------------------------

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

async function fetchDiskUsage(): Promise<DiskUsageResponse> {
  const res = await fetch(`${API_URL}/api/cleanup/disk-usage`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch disk usage");
  return res.json() as Promise<DiskUsageResponse>;
}

async function fetchCleanupSettings(): Promise<CleanupSettingsResponse> {
  const res = await fetch(`${API_URL}/api/cleanup/settings`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch cleanup settings");
  return res.json() as Promise<CleanupSettingsResponse>;
}

async function updateCleanupSettings(input: UpdateCleanupSettingsInput): Promise<CleanupSettingsResponse> {
  const res = await fetch(`${API_URL}/api/cleanup/settings`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("Failed to update cleanup settings");
  return res.json() as Promise<CleanupSettingsResponse>;
}

async function fetchCleanupHistory(): Promise<{ runs: CleanupRunResponse[] }> {
  const res = await fetch(`${API_URL}/api/cleanup/history`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch cleanup history");
  return res.json() as Promise<{ runs: CleanupRunResponse[] }>;
}

async function triggerCleanup(): Promise<void> {
  const res = await fetch(`${API_URL}/api/cleanup/run`, { method: "POST", credentials: "include" });
  if (!res.ok) throw new Error("Failed to trigger cleanup");
}

// ---------------------------------------------------------------------------
// useDiskUsage — disk-usage-by-category breakdown
// ---------------------------------------------------------------------------

export function useDiskUsage() {
  const query = useQuery({
    queryKey: ["cleanup", "disk-usage"],
    queryFn: fetchDiskUsage,
    staleTime: 15_000,
  });

  return {
    categories: query.data?.categories ?? [],
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

// ---------------------------------------------------------------------------
// useCleanupRun — manual "Clean up" trigger
// ---------------------------------------------------------------------------

export function useCleanupRun() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: triggerCleanup,
    onSuccess: () => {
      toast.success("Cleanup started");
      void queryClient.invalidateQueries({ queryKey: ["cleanup"] });
    },
    onError: () => toast.error("Failed to start cleanup"),
  });

  return {
    runCleanup: () => mutation.mutate(),
    isRunning: mutation.isPending,
  };
}

// ---------------------------------------------------------------------------
// useCleanupSettings — schedule + prune-after-redeploy config
// ---------------------------------------------------------------------------

export function useCleanupSettings() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["cleanup", "settings"],
    queryFn: fetchCleanupSettings,
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: updateCleanupSettings,
    onSuccess: () => {
      toast.success("Cleanup settings updated");
      void queryClient.invalidateQueries({ queryKey: ["cleanup", "settings"] });
    },
    onError: () => toast.error("Failed to update cleanup settings"),
  });

  return {
    settings: query.data,
    isLoading: query.isLoading,
    updateSettings: (input: UpdateCleanupSettingsInput) => mutation.mutate(input),
    isSaving: mutation.isPending,
  };
}

// ---------------------------------------------------------------------------
// useCleanupHistory — recent cleanup runs
// ---------------------------------------------------------------------------

export function useCleanupHistory() {
  const query = useQuery({
    queryKey: ["cleanup", "history"],
    queryFn: fetchCleanupHistory,
    staleTime: 10_000,
  });

  return {
    runs: query.data?.runs ?? [],
    isLoading: query.isLoading,
  };
}
