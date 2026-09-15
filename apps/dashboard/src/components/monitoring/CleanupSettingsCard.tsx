"use client";

import { useEffect, useState } from "react";
import { Loader2, Settings2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useCleanupSettings } from "@/hooks/useCleanup";
import { useSystemSettings } from "@/hooks/useSystemSettings";

/**
 * Optional scheduled Docker cleanup + prune-after-redeploy config (F5.15).
 * Off by default; mirrors BackupSettingsCard's schedule/retention pattern.
 */
export function CleanupSettingsCard() {
  const { settings, isLoading, updateSettings, isSaving } = useCleanupSettings();
  const { timezone } = useSystemSettings();

  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleCron, setScheduleCron] = useState("");
  const [pruneAfterRedeploy, setPruneAfterRedeploy] = useState(false);

  useEffect(() => {
    if (settings) {
      setScheduleEnabled(settings.scheduleEnabled);
      setScheduleCron(settings.scheduleCron);
      setPruneAfterRedeploy(settings.pruneAfterRedeploy);
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings({ scheduleEnabled, scheduleCron, pruneAfterRedeploy });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          Cleanup Schedule
        </CardTitle>
        <CardDescription>
          Automatic cleanup is off by default. Enable it to prune stopped containers and unused
          images on a schedule.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="cleanup-schedule-enabled">Scheduled cleanup</Label>
                <p className="text-xs text-muted-foreground">
                  Runs the same cleanup as the manual button, on a cron schedule.
                </p>
              </div>
              <Switch
                id="cleanup-schedule-enabled"
                checked={scheduleEnabled}
                onCheckedChange={setScheduleEnabled}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cleanup-schedule-cron">Schedule (cron)</Label>
              <Input
                id="cleanup-schedule-cron"
                value={scheduleCron}
                onChange={(e) => setScheduleCron(e.target.value)}
                placeholder="0 4 * * *"
                disabled={!scheduleEnabled}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Default: <code className="rounded bg-muted px-1 py-0.5">0 4 * * *</code> (daily at 4am)
                {timezone && (
                  <>
                    {" "}
                    — times are in <span className="font-medium text-foreground">{timezone}</span>, set
                    on the <a href="/settings" className="underline underline-offset-2">Settings page</a>
                  </>
                )}
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="cleanup-prune-redeploy">Prune old image after redeploy</Label>
                <p className="text-xs text-muted-foreground">
                  Removes the previous image only after the new one is confirmed running.
                </p>
              </div>
              <Switch
                id="cleanup-prune-redeploy"
                checked={pruneAfterRedeploy}
                onCheckedChange={setPruneAfterRedeploy}
              />
            </div>

            <Button size="sm" onClick={handleSave} disabled={isSaving} className="gap-1.5">
              {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save Settings
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
