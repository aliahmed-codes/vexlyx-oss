"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  RefreshCw,
  Upload,
  Sparkles,
  AlertTriangle,
  AlertCircle,
  Calendar,
  FileText,
  Key,
  Globe,
  Server,
  Trash2,
  ChevronRight,
  Info,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchAPI, ApiRequestError } from "@/lib/api";
import { useDomainSsl } from "@/hooks/useDomainSsl";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/datetime";
import { useTimezone } from "@/hooks/useSystemSettings";
import { refreshIconClassName } from "@/hooks/useRefreshAnimation";
import type { DomainResponse } from "@vexlyx/shared";

function formatDate(date: Date | string | null | undefined, timezone?: string) {
  if (!date) return "—";
  return formatDateTime(date, timezone);
}

export default function DomainSslPage() {
  const params = useParams();
  const domainId = params.id as string;
  const timezone = useTimezone();

  const [domain, setDomain] = useState<DomainResponse | null>(null);
  const [domainLoading, setDomainLoading] = useState(true);

  const {
    certificate,
    isLoading: sslLoading,
    isRefreshing,
    isProvisioning,
    isUploading,
    isRenewing,
    isUpdating,
    isDisabling,
    refresh,
    provisionAutoSsl,
    uploadCustomCert,
    renewCert,
    updateSettings,
    disableSsl,
  } = useDomainSsl({ domainId });

  // Modal states
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [disableModalOpen, setDisableModalOpen] = useState(false);

  // Upload Form State
  const [certInput, setCertInput] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [forceHttpsUpload, setForceHttpsUpload] = useState(true);

  // Fetch parent domain details
  useEffect(() => {
    async function loadDomain() {
      try {
        setDomainLoading(true);
        const res = await fetchAPI<DomainResponse>(`/api/domains/${domainId}`);
        setDomain(res);
      } catch (err) {
        toast.error(err instanceof ApiRequestError ? err.message : "Failed to load domain");
      } finally {
        setDomainLoading(false);
      }
    }
    if (domainId) {
      void loadDomain();
    }
  }, [domainId]);

  const handleManualRefresh = async () => {
    await refresh();
    toast.success("Certificate status refreshed");
  };

  const handleProvisionAutoSsl = async () => {
    try {
      await provisionAutoSsl({
        type: "LETS_ENCRYPT",
        forceHttps: true,
        autoRenew: true,
      });
      toast.success("SSL certificate provisioned successfully via Traefik");
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Failed to provision SSL");
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!certInput.trim() || !keyInput.trim()) {
      toast.error("Please provide both certificate and private key content");
      return;
    }

    try {
      await uploadCustomCert({
        certificate: certInput.trim(),
        privateKey: keyInput.trim(),
        forceHttps: forceHttpsUpload,
      });
      toast.success("Custom SSL certificate uploaded and activated");
      setUploadModalOpen(false);
      setCertInput("");
      setKeyInput("");
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Failed to upload certificate");
    }
  };

  const handleRenew = async () => {
    try {
      await renewCert();
      toast.success("Certificate renewed successfully");
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Renewal failed");
    }
  };

  const handleToggleForceHttps = async () => {
    if (!certificate) return;
    const nextVal = !certificate.forceHttps;
    try {
      await updateSettings({ forceHttps: nextVal });
      toast.success(nextVal ? "HTTPS redirection enforced" : "HTTPS redirection disabled");
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Failed to update setting");
    }
  };

  const handleToggleAutoRenew = async () => {
    if (!certificate) return;
    const nextVal = !certificate.autoRenew;
    try {
      await updateSettings({ autoRenew: nextVal });
      toast.success(nextVal ? "Automatic renewal enabled" : "Automatic renewal disabled");
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Failed to update setting");
    }
  };

  const handleDisableSsl = async () => {
    try {
      await disableSsl();
      toast.success("SSL disabled for domain");
      setDisableModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Failed to disable SSL");
    }
  };

  const isLoading = domainLoading || sslLoading;
  const isExpiringSoon = certificate?.isExpiringSoon ?? false;
  const isExpired = certificate?.isExpired ?? false;

  return (
    <div className="space-y-6">
      {/* Breadcrumbs & Navigation */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link
            href="/domains"
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Domains</span>
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground truncate max-w-[200px]">
            {domain?.hostname ?? "Domain"}
          </span>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-semibold text-primary">SSL / TLS</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="h-8 text-xs gap-1.5"
          >
            <RefreshCw className={refreshIconClassName(isRefreshing, "h-3.5 w-3.5")} />
            <span>Refresh</span>
          </Button>

          {domain?.dnsMode === "MANAGED" && (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
            >
              <Link href={`/domains/${domain.id}/dns`}>
                <Server className="h-3.5 w-3.5 text-indigo-500" />
                <span>DNS Records</span>
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Header Banner */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-xs">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold tracking-tight text-foreground font-mono">
                {domain?.hostname ?? <Skeleton className="h-6 w-48 inline-block" />}
              </h1>

              {certificate ? (
                <Badge
                  variant="outline"
                  className={cn(
                    "gap-1 text-xs font-medium py-0.5 px-2.5",
                    isExpired
                      ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                      : isExpiringSoon
                        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                        : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
                  )}
                >
                  {isExpired ? (
                    <>
                      <AlertCircle className="h-3.5 w-3.5" />
                      Expired
                    </>
                  ) : isExpiringSoon ? (
                    <>
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Expiring Soon ({certificate.daysRemaining}d)
                    </>
                  ) : (
                    <>
                      <Lock className="h-3.5 w-3.5" />
                      Secure (Active)
                    </>
                  )}
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="gap-1 text-xs font-medium py-0.5 px-2.5 bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20"
                >
                  <Unlock className="h-3.5 w-3.5" />
                  No SSL Active
                </Badge>
              )}

              {certificate?.type && (
                <Badge variant="secondary" className="text-[11px] font-mono">
                  {certificate.type === "LETS_ENCRYPT"
                    ? "Let's Encrypt"
                    : certificate.type === "CUSTOM"
                      ? "Custom Cert"
                      : "Self-Signed Dev"}
                </Badge>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Automated TLS encryption powered by Traefik v3. Supports Let&apos;s Encrypt HTTP-01/DNS-01, custom certificates, and automatic renewal.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!certificate ? (
              <>
                <Button
                  size="sm"
                  onClick={handleProvisionAutoSsl}
                  disabled={isProvisioning || domain?.status !== "ACTIVE"}
                  className="h-9 text-xs gap-1.5 font-medium"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {isProvisioning ? "Provisioning…" : "Enable Auto SSL"}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setUploadModalOpen(true)}
                  disabled={domain?.status !== "ACTIVE"}
                  className="h-9 text-xs gap-1.5 font-medium"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload Custom Cert
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setUploadModalOpen(true)}
                  className="h-9 text-xs gap-1.5 font-medium"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Replace Cert
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRenew}
                  disabled={isRenewing || certificate.type === "CUSTOM"}
                  title={certificate.type === "CUSTOM" ? "Custom certs cannot be auto-renewed" : undefined}
                  className="h-9 text-xs gap-1.5 font-medium"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", isRenewing && "animate-spin")} />
                  {isRenewing ? "Renewing…" : "Force Renew"}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDisableModalOpen(true)}
                  disabled={isDisabling}
                  className="h-9 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-500/10 dark:text-rose-400 gap-1.5"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Disable SSL
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Expiry Alert Warning Banner (F3.4 Acceptance Test: 7-day Alert) */}
      {isExpiringSoon && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3 text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <h4 className="font-semibold text-sm">
              Certificate Expiration Warning
            </h4>
            <p>
              This certificate will expire in{" "}
              <span className="font-bold underline">
                {certificate?.daysRemaining} days
              </span>{" "}
              on {formatDate(certificate?.validTo, timezone)}. If automatic renewal fails, your visitors will see a security warning.
            </p>
            <div className="pt-1 flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleRenew}
                disabled={isRenewing}
                className="h-7 text-xs bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/40"
              >
                Renew Now
              </Button>
            </div>
          </div>
        </div>
      )}

      {isExpired && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 flex items-start gap-3 text-rose-900 dark:text-rose-200">
          <AlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <h4 className="font-semibold text-sm">Certificate Expired</h4>
            <p>
              This certificate expired on {formatDate(certificate?.validTo, timezone)}. Web browsers are currently blocking access to this site with security warnings.
            </p>
            <div className="pt-1 flex items-center gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={handleRenew}
                disabled={isRenewing}
                className="h-7 text-xs"
              >
                Renew Certificate Now
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Certificate Details (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Certificate Overview
              </CardTitle>
              <CardDescription className="text-xs">
                Cryptographic parameters, validity period, and SAN records.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 pt-0">
              {isLoading ? (
                <div className="space-y-3 py-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ) : certificate ? (
                <div className="space-y-4">
                  {/* Validity Progress Bar */}
                  {certificate.daysRemaining !== null && (
                    <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground font-medium">Validity Countdown:</span>
                        <span className="font-mono font-semibold">
                          {certificate.daysRemaining} days remaining
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            "h-full transition-all duration-300",
                            isExpired
                              ? "bg-rose-500"
                              : isExpiringSoon
                                ? "bg-amber-500"
                                : "bg-emerald-500",
                          )}
                          style={{
                            width: `${Math.max(
                              5,
                              Math.min(100, ((certificate.daysRemaining ?? 0) / 90) * 100),
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Attributes Grid */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
                    <div className="rounded-md border border-border p-3 space-y-1">
                      <div className="text-muted-foreground flex items-center gap-1.5 font-medium">
                        <Globe className="h-3.5 w-3.5 text-indigo-500" />
                        Common Name
                      </div>
                      <div className="font-mono font-semibold text-foreground truncate">
                        {certificate.commonName}
                      </div>
                    </div>

                    <div className="rounded-md border border-border p-3 space-y-1">
                      <div className="text-muted-foreground flex items-center gap-1.5 font-medium">
                        <FileText className="h-3.5 w-3.5 text-emerald-500" />
                        Issuer Authority
                      </div>
                      <div className="font-medium text-foreground truncate">
                        {certificate.issuer ?? "Let's Encrypt"}
                      </div>
                    </div>

                    <div className="rounded-md border border-border p-3 space-y-1">
                      <div className="text-muted-foreground flex items-center gap-1.5 font-medium">
                        <Calendar className="h-3.5 w-3.5 text-blue-500" />
                        Valid From
                      </div>
                      <div className="font-medium text-foreground">
                        {formatDate(certificate.validFrom, timezone)}
                      </div>
                    </div>

                    <div className="rounded-md border border-border p-3 space-y-1">
                      <div className="text-muted-foreground flex items-center gap-1.5 font-medium">
                        <Calendar className="h-3.5 w-3.5 text-amber-500" />
                        Valid Until
                      </div>
                      <div className="font-medium text-foreground">
                        {formatDate(certificate.validTo, timezone)}
                      </div>
                    </div>

                    {certificate.serialNumber && (
                      <div className="rounded-md border border-border p-3 space-y-1 sm:col-span-2">
                        <div className="text-muted-foreground flex items-center gap-1.5 font-medium">
                          <Key className="h-3.5 w-3.5 text-purple-500" />
                          Certificate Serial Number
                        </div>
                        <div className="font-mono text-[11px] text-foreground break-all">
                          {certificate.serialNumber}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* SANs (Subject Alternative Names) */}
                  <div className="space-y-1.5 pt-1">
                    <div className="text-xs font-medium text-muted-foreground">
                      Covered Hostnames (Subject Alternative Names):
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {certificate.sans && certificate.sans.length > 0 ? (
                        certificate.sans.map((san) => (
                          <Badge
                            key={san}
                            variant="secondary"
                            className="font-mono text-[11px] py-0.5 px-2"
                          >
                            {san}
                          </Badge>
                        ))
                      ) : (
                        <Badge variant="secondary" className="font-mono text-[11px]">
                          {certificate.commonName}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 space-y-3">
                  <div className="mx-auto h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold">No SSL Certificate Provisioned</h3>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                      Traffic to {domain?.hostname} is currently served over insecure HTTP on port 80.
                    </p>
                  </div>
                  <div className="pt-2 flex items-center justify-center gap-2">
                    <Button
                      size="sm"
                      onClick={handleProvisionAutoSsl}
                      disabled={isProvisioning || domain?.status !== "ACTIVE"}
                      className="h-8 text-xs font-medium"
                    >
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                      Provision Free SSL (Let&apos;s Encrypt)
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Security & Routing Settings Sidebar (1 col) */}
        <div className="space-y-6">
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Security Settings</CardTitle>
              <CardDescription className="text-xs">
                Configure Traefik HTTPS routing behavior.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 pt-0 text-xs">
              {/* Force HTTPS Toggle */}
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">Enforce HTTPS Redirect</span>
                  <Button
                    variant={certificate?.forceHttps ? "default" : "outline"}
                    size="sm"
                    onClick={handleToggleForceHttps}
                    disabled={isUpdating || !certificate}
                    className="h-6 px-2 text-[11px]"
                  >
                    {certificate?.forceHttps ? "Enforced" : "Disabled"}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Automatically redirects all unencrypted HTTP (:80) traffic to encrypted HTTPS (:443) via Traefik 301 Permanent Redirect.
                </p>
              </div>

              {/* Auto Renewal Toggle */}
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">Auto-Renewal</span>
                  <Button
                    variant={certificate?.autoRenew ? "default" : "outline"}
                    size="sm"
                    onClick={handleToggleAutoRenew}
                    disabled={isUpdating || !certificate || certificate.type === "CUSTOM"}
                    className="h-6 px-2 text-[11px]"
                  >
                    {certificate?.autoRenew ? "Enabled" : "Disabled"}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Traefik ACME will evaluate and renew your certificate automatically 30 days prior to expiry.
                </p>
              </div>

              {/* Traefik Information Box */}
              <div className="rounded-lg border border-border/80 bg-muted/30 p-3 space-y-2">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <Info className="h-3.5 w-3.5 text-primary" />
                  Traefik v3 Details
                </div>
                <div className="space-y-1 text-[11px] text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Entrypoint:</span>
                    <span className="font-mono text-foreground">
                      {certificate ? "websecure (:443)" : "web (:80)"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Challenge Type:</span>
                    <span className="text-foreground">
                      {domain?.hostname.startsWith("*.") ? "DNS-01 (Wildcard)" : "HTTP-01 (ACME)"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Resolver:</span>
                    <span className="font-mono text-foreground">letsencrypt</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Manual Certificate Upload Dialog */}
      <Dialog open={uploadModalOpen} onOpenChange={setUploadModalOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Upload Custom SSL Certificate</DialogTitle>
            <DialogDescription className="text-xs">
              Upload your PEM-formatted certificate chain (.crt) and matching private key (.key). Sensitive keys are encrypted at rest with AES-256-GCM.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUploadSubmit} className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label htmlFor="cert-pem">Certificate (PEM / .crt chain)</Label>
              <Textarea
                id="cert-pem"
                placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                value={certInput}
                onChange={(e) => setCertInput(e.target.value)}
                rows={6}
                required
                className="font-mono text-[11px]"
              />
              <p className="text-[11px] text-muted-foreground">
                Include intermediate and root CA certificates if available.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="key-pem">Private Key (PEM / .key)</Label>
              <Textarea
                id="key-pem"
                placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                rows={5}
                required
                className="font-mono text-[11px]"
              />
              <p className="text-[11px] text-muted-foreground">
                Your private key will never be exposed or logged.
              </p>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-md border border-border bg-muted/20">
              <div>
                <div className="font-medium text-foreground">Enforce HTTPS</div>
                <div className="text-[11px] text-muted-foreground">
                  Redirect HTTP (:80) to HTTPS (:443)
                </div>
              </div>
              <Button
                type="button"
                variant={forceHttpsUpload ? "default" : "outline"}
                size="sm"
                onClick={() => setForceHttpsUpload(!forceHttpsUpload)}
                className="h-6 px-2 text-[11px]"
              >
                {forceHttpsUpload ? "Yes" : "No"}
              </Button>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setUploadModalOpen(false)}
                className="h-8 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isUploading}
                className="h-8 text-xs font-medium"
              >
                {isUploading ? "Validating & Saving…" : "Save & Activate Certificate"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Disable SSL Confirmation Dialog */}
      <Dialog open={disableModalOpen} onOpenChange={setDisableModalOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-rose-600 dark:text-rose-400">
              Disable SSL Protection?
            </DialogTitle>
            <DialogDescription className="text-xs">
              This will remove the SSL certificate and HTTPS routing in Traefik. All traffic to{" "}
              <span className="font-mono font-semibold text-foreground">
                {domain?.hostname}
              </span>{" "}
              will revert to unencrypted plain HTTP.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDisableModalOpen(false)}
              className="h-8 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDisableSsl}
              disabled={isDisabling}
              className="h-8 text-xs"
            >
              {isDisabling ? "Disabling…" : "Disable SSL"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
