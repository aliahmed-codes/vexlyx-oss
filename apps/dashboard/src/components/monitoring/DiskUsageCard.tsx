"use client";

import { useState } from "react";
import { HardDrive, RefreshCw, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRefreshAnimation, refreshIconClassName } from "@/hooks/useRefreshAnimation";
import { useDiskUsage, useCleanupRun } from "@/hooks/useCleanup";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Docker disk-usage-by-category breakdown (F5.15), backed by
 * `docker system df`, with a manual "Clean up" action that runs
 * `docker container prune` + `docker image prune -a`.
 */
export function DiskUsageCard() {
  const { categories, isLoading, refetch } = useDiskUsage();
  const { runCleanup, isRunning } = useCleanupRun();
  const { isRefreshing, refresh } = useRefreshAnimation();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleRefresh = () => refresh(async () => refetch());

  const totalReclaimable = categories.reduce((sum, c) => sum + c.reclaimableBytes, 0);

  const handleConfirmCleanup = () => {
    runCleanup();
    setConfirmOpen(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <HardDrive className="h-4 w-4 text-muted-foreground" />
          Docker Disk Usage
        </CardTitle>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleRefresh}
            aria-label="Refresh disk usage"
          >
            <RefreshCw className={refreshIconClassName(isRefreshing, "h-3.5 w-3.5")} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setConfirmOpen(true)}
            disabled={isRunning || totalReclaimable === 0}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clean up
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Active</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead className="text-right">Reclaimable</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((c) => (
                <TableRow key={c.type}>
                  <TableCell className="font-medium">{c.type}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{c.total}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{c.active}</TableCell>
                  <TableCell className="text-right">{formatBytes(c.sizeBytes)}</TableCell>
                  <TableCell className="text-right text-amber-600 dark:text-amber-400">
                    {formatBytes(c.reclaimableBytes)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clean up Docker disk usage?</DialogTitle>
            <DialogDescription>
              Removes all stopped containers and any image not currently used by a running
              container ({formatBytes(totalReclaimable)} reclaimable). Volumes and build cache
              are left untouched. Running projects are unaffected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={handleConfirmCleanup}>
              Clean up
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
