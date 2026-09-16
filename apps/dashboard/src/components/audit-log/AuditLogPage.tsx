"use client";

import { useState } from "react";
import { ShieldAlert, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useAuditLog, type AuditLogFilters } from "@/hooks/useAuditLog";
import { AuditLogTable } from "./AuditLogTable";
import { AUDIT_ACTIONS } from "@vexlyx/shared";

const PAGE_SIZE = 25;

function formatActionLabel(action: string): string {
  return action
    .replace(".", " — ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * /audit-log — F5.18 Audit Log. Admin-only: records who changed a role,
 * quota, firewall rule, or deleted an account/backup/resource, so those
 * actions are never silent.
 */
export function AuditLogPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [actorFilterEmail, setActorFilterEmail] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const { entries, total, isLoading } = useAuditLog(filters, page, PAGE_SIZE);

  if (isAuthLoading) return null;

  if (user?.role !== "ADMIN") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <ShieldAlert className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Access restricted</p>
          <p className="text-xs text-muted-foreground">Only administrators can view the audit log.</p>
        </CardContent>
      </Card>
    );
  }

  const updateFilters = (next: Partial<AuditLogFilters>) => {
    setFilters((prev) => ({ ...prev, ...next }));
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-muted-foreground">
          A record of role changes, quota changes, and other security-sensitive actions across the panel.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Action</label>
            <Select
              value={filters.action ?? "all"}
              onValueChange={(val) => updateFilters({ action: val === "all" ? undefined : val })}
            >
              <SelectTrigger className="w-56 bg-card border-border">
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {AUDIT_ACTIONS.map((action) => (
                  <SelectItem key={action} value={action}>
                    {formatActionLabel(action)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">From</label>
            <Input
              type="date"
              className="w-40 bg-card border-border"
              onChange={(e) =>
                updateFilters({ dateFrom: e.target.value ? new Date(e.target.value).toISOString() : undefined })
              }
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">To</label>
            <Input
              type="date"
              className="w-40 bg-card border-border"
              onChange={(e) =>
                updateFilters({
                  dateTo: e.target.value ? new Date(`${e.target.value}T23:59:59.999Z`).toISOString() : undefined,
                })
              }
            />
          </div>

          {actorFilterEmail && (
            <Badge variant="secondary" className="flex items-center gap-1">
              Actor: {actorFilterEmail}
              <button
                type="button"
                aria-label="Clear actor filter"
                onClick={() => {
                  setActorFilterEmail(null);
                  updateFilters({ actorId: undefined });
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Events</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <AuditLogTable
            entries={entries}
            isLoading={isLoading}
            onFilterByActor={(actorId, actorEmail) => {
              setActorFilterEmail(actorEmail);
              updateFilters({ actorId });
            }}
          />
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages} ({total} events)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
