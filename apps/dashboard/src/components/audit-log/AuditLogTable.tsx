"use client";

import { ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/datetime";
import { useTimezone } from "@/hooks/useSystemSettings";
import type { AuditLogEntry, Role } from "@vexlyx/shared";

interface AuditLogTableProps {
  entries: AuditLogEntry[];
  isLoading: boolean;
  onFilterByActor: (actorId: string, actorEmail: string) => void;
}

const ROLE_VARIANT: Record<Role, "default" | "secondary" | "outline"> = {
  ADMIN: "default",
  RESELLER: "outline",
  USER: "secondary",
};

// "user.role_changed" -> "Role changed" — the namespace already shows as
// the Target column, so the action label only needs the verb phrase.
function formatAction(action: string): string {
  const verb = action.split(".").slice(1).join(" ") || action;
  const words = verb.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function formatMetadataValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function AuditLogTable({ entries, isLoading, onFilterByActor }: AuditLogTableProps) {
  const timezone = useTimezone();

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <ScrollText className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium">No audit events</p>
        <p className="text-xs text-muted-foreground">
          Nothing matches the current filters yet.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Actor</TableHead>
          <TableHead>Action</TableHead>
          <TableHead>Target</TableHead>
          <TableHead>Details</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => {
          const metadata = (entry.metadata ?? {}) as { before?: Record<string, unknown>; after?: Record<string, unknown> };

          return (
            <TableRow key={entry.id}>
              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                {formatDateTime(entry.createdAt, timezone)}
              </TableCell>
              <TableCell>
                <button
                  type="button"
                  onClick={() => entry.actorId && onFilterByActor(entry.actorId, entry.actorEmail)}
                  className="text-left text-sm font-medium hover:underline disabled:no-underline"
                  disabled={!entry.actorId}
                  aria-label={`Filter by ${entry.actorEmail}`}
                >
                  {entry.actorEmail}
                </button>
                <div>
                  <Badge variant={ROLE_VARIANT[entry.actorRole]} className="mt-1">
                    {entry.actorRole}
                  </Badge>
                </div>
              </TableCell>
              <TableCell className="text-sm">{formatAction(entry.action)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {entry.targetType}
                <div className="font-mono">{entry.targetId}</div>
              </TableCell>
              <TableCell className="max-w-xs text-xs text-muted-foreground">
                {metadata.before && (
                  <div>
                    <span className="font-medium">Before:</span>{" "}
                    {Object.entries(metadata.before)
                      .map(([k, v]) => `${k}=${formatMetadataValue(v)}`)
                      .join(", ")}
                  </div>
                )}
                {metadata.after && (
                  <div>
                    <span className="font-medium">After:</span>{" "}
                    {Object.entries(metadata.after)
                      .map(([k, v]) => `${k}=${formatMetadataValue(v)}`)
                      .join(", ")}
                  </div>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
