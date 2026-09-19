"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, CheckCircle2, Copy, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RequiredMailRecordResponse } from "@vexlyx/shared";

const PURPOSE_LABEL: Record<RequiredMailRecordResponse["purpose"], string> = {
  MX: "MX",
  HOST: "Mail host",
  SPF: "SPF",
  DMARC: "DMARC",
  DKIM: "DKIM",
};

interface RegistrarRecordsTableProps {
  domainId: string;
  records: RequiredMailRecordResponse[];
  isChecking: boolean;
  onCheck: () => void;
}

export function RegistrarRecordsTable({
  domainId,
  records,
  isChecking,
  onCheck,
}: RegistrarRecordsTableProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyValue = (text: string, key: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="mb-4 space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-foreground">
            Add these records at your registrar
          </h4>
          <p className="text-xs text-muted-foreground">
            DNS for this domain stays with your provider, so mail records must be added there. The
            score above reflects what public DNS serves right now.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-2"
          onClick={onCheck}
          disabled={isChecking}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isChecking && "animate-spin")} />
          Check records
        </Button>
      </div>

      <div className="space-y-2">
        {records.map((record) => {
          const key = `${domainId}-${record.purpose}`;
          return (
            <div key={key} className="rounded-md border border-border bg-background p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-foreground">{PURPOSE_LABEL[record.purpose]}</span>
                  <span className="font-mono text-muted-foreground">
                    {record.type} · {record.name}
                    {record.priority !== undefined && ` · priority ${record.priority}`}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {record.live ? (
                    <Badge
                      variant="outline"
                      className="border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    >
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Live
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    >
                      Not found
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    aria-label={`Copy ${record.purpose} record value`}
                    onClick={() => copyValue(record.value, key)}
                  >
                    {copiedKey === key ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
              <code className="mt-2 block max-h-20 overflow-y-auto break-all rounded bg-slate-950 p-2 font-mono text-xs text-slate-100">
                {record.value}
              </code>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Prefer to have Vexlyx manage all DNS for this domain?{" "}
        <Link href={`/domains/${domainId}/dns`} className="font-medium text-primary hover:underline">
          Host DNS on Vexlyx
        </Link>
      </p>
    </div>
  );
}
