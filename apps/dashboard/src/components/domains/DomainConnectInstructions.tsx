"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { DomainResponse } from "@vexlyx/shared";

interface DomainConnectInstructionsProps {
  domain: DomainResponse;
  showDnsHostingLink?: boolean;
}

export function DomainConnectInstructions({
  domain,
  showDnsHostingLink = false,
}: DomainConnectInstructionsProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const baseHost = domain.hostname.replace(/^\*\./, "");
  const routingRecord = domain.verificationInstructions?.routingRecord;
  const publicIp = routingRecord?.publicIp ?? null;
  const txtValue =
    domain.verificationInstructions?.recordValue ??
    `vexlyx-verification=${domain.verificationToken ?? ""}`;

  const copyToClipboard = (text: string, field: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="space-y-4 py-2">
      <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="font-semibold text-muted-foreground">Record Type</div>
          <div className="font-semibold text-muted-foreground">Name / Host</div>
          <div className="font-semibold text-muted-foreground">TTL</div>
          <div className="font-mono text-foreground font-bold">TXT</div>
          <div className="font-mono text-foreground break-all">_vexlyx-challenge.{baseHost}</div>
          <div className="font-mono text-foreground">300 (or Auto)</div>
        </div>

        <div className="space-y-1 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold text-muted-foreground">TXT Record Value</Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(txtValue, "txt-value")}
              className="h-6 px-2 text-[11px] gap-1 text-primary hover:text-primary"
            >
              {copiedField === "txt-value" ? (
                <>
                  <Check className="h-3 w-3" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copy Value
                </>
              )}
            </Button>
          </div>
          <div className="rounded border border-border bg-background p-2 font-mono text-xs text-foreground break-all select-all">
            {txtValue}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          The TXT record above only proves you own this domain &mdash; it doesn&rsquo;t route traffic
          here. Add this <span className="font-medium text-foreground">A record</span> too, or the
          domain will verify successfully but show nothing when visited.
        </p>
        {routingRecord && publicIp ? (
          <>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="font-semibold text-muted-foreground">Record Type</div>
              <div className="font-semibold text-muted-foreground">Name / Host</div>
              <div className="font-semibold text-muted-foreground">Value</div>
              <div className="font-mono text-foreground font-bold">A</div>
              <div className="font-mono text-foreground break-all">{routingRecord.recordName}</div>
              <div className="font-mono text-foreground break-all">{publicIp}</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(publicIp, "a-value")}
              className="h-6 px-2 text-[11px] gap-1 text-primary hover:text-primary"
            >
              {copiedField === "a-value" ? (
                <>
                  <Check className="h-3 w-3" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copy IP
                </>
              )}
            </Button>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            This server&rsquo;s public IP hasn&rsquo;t been detected &mdash; check the Settings page,
            or ask your admin for the server&rsquo;s IP to use as the A record value.
          </p>
        )}
      </div>

      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
        DNS propagation typically takes a few minutes, but can occasionally take up to 24-48 hours
        depending on your registrar TTL.
      </div>

      {showDnsHostingLink && domain.dnsMode === "CONNECTED" && (
        <p className="text-xs text-muted-foreground">
          Want Vexlyx to run all DNS for this domain instead?{" "}
          <Link
            href={`/domains/${domain.id}/dns`}
            className="font-medium text-primary hover:underline"
          >
            Host DNS on Vexlyx
          </Link>
        </p>
      )}
    </div>
  );
}
