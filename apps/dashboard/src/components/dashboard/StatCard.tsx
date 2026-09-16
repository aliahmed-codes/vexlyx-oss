import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value?: string;
  description?: string;
  icon: LucideIcon;
  /** When true, shows skeleton placeholders instead of actual values */
  isLoading?: boolean;
  className?: string;
  /**
   * When given and `limit` is not null, renders a thin used/limit quota bar
   * beneath the value instead of `description`. A null `limit` means
   * unlimited — no bar is shown.
   */
  usage?: { used: number; limit: number | null };
}

/**
 * Reusable stat card for the dashboard overview.
 * Shows a metric with icon, value, and optional description.
 * Supports a loading state with skeleton animation per CLAUDE.md Section 15
 * (pulse animation, never spinners).
 */
export function StatCard({
  title,
  value,
  description,
  icon: Icon,
  isLoading = false,
  className,
  usage,
}: StatCardProps) {
  return (
    <Card className={cn("border border-border", className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-4 w-32" />
          </div>
        ) : (
          <>
            <div className="text-2xl font-bold">{value}</div>
            {usage && usage.limit !== null ? (
              <QuotaBar used={usage.used} limit={usage.limit} />
            ) : (
              description && (
                <p className="text-xs text-muted-foreground">{description}</p>
              )
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Thin used/limit progress line for a StatCard's quota, e.g. "3 / 10". */
function QuotaBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const barColour = pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="mt-2 space-y-1">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-700 ease-out", barColour)}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {used} / {limit} used
      </p>
    </div>
  );
}
