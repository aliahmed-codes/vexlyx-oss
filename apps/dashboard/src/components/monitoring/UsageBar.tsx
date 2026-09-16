"use client";

import { cn } from "@/lib/utils";

interface UsageBarProps {
  label: string;
  used: number;
  total: number;
  /** Override auto-computed percentage */
  percent?: number;
  warnAt?: number;
  dangerAt?: number;
  className?: string;
  /**
   * Overrides the default "used / total" byte caption. Pass `null` to omit
   * the caption line entirely (e.g. for a percent-only metric like CPU,
   * where used/total aren't byte counts).
   */
  caption?: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Horizontal bar showing used/total with colour-coded danger zones.
 * Used for Disk, RAM in summary view.
 */
export function UsageBar({
  label,
  used,
  total,
  percent,
  warnAt = 70,
  dangerAt = 90,
  className,
  caption,
}: UsageBarProps) {
  const pct =
    percent !== undefined
      ? percent
      : total > 0
        ? Math.min(100, (used / total) * 100)
        : 0;

  const barColour =
    pct >= dangerAt
      ? "bg-rose-500"
      : pct >= warnAt
        ? "bg-amber-500"
        : "bg-emerald-500";

  const textColour =
    pct >= dangerAt
      ? "text-rose-500"
      : pct >= warnAt
        ? "text-amber-500"
        : "text-emerald-500";

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className={cn("text-sm font-semibold tabular-nums", textColour)}>
          {pct.toFixed(1)}%
        </span>
      </div>

      {/* Track */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-700 ease-out", barColour)}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label}
        />
      </div>

      {/* Used / Total */}
      {caption !== null && (
        <p className="text-xs text-muted-foreground">
          {caption ?? `${formatBytes(used)} / ${formatBytes(total)}`}
        </p>
      )}
    </div>
  );
}

export { formatBytes };
