"use client";

import { useState } from "react";
import Link from "next/link";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import { useAuthConfig } from "@/hooks/useAuthConfig";
import { ApiRequestError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type FieldErrors = Partial<Record<"email" | "password" | "totpToken" | "root", string>>;

export function LoginForm() {
  const { login, verifyTotp } = useAuth();
  const { allowRegistration } = useAuthConfig();
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  // TOTP step state
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [totpToken, setTotpToken] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrors({});

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const result = loginSchema.safeParse({ email, password });

    if (!result.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof FieldErrors;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setIsLoading(true);

    try {
      const response = await login(email, password);
      if ("requiresTotp" in response && response.requiresTotp) {
        setPendingToken(response.pendingToken);
        return;
      }
      toast.success("Welcome back!");
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setErrors({ root: err.message });
        toast.error(err.message);
      } else {
        setErrors({ root: "An unexpected error occurred" });
        toast.error("An unexpected error occurred");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleTotpSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrors({});

    if (!totpToken || totpToken.length !== 6) {
      setErrors({ totpToken: "Enter the 6-digit code from your authenticator app" });
      return;
    }

    if (!pendingToken) return;

    setIsLoading(true);
    try {
      await verifyTotp(pendingToken, totpToken);
      toast.success("Welcome back!");
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setErrors({ totpToken: err.message });
        toast.error(err.message);
      } else {
        setErrors({ totpToken: "An unexpected error occurred" });
        toast.error("An unexpected error occurred");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // --- 2FA Step ---
  if (pendingToken) {
    return (
      <Card className="border-border">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            Two-factor authentication
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter the 6-digit code from your authenticator app
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleTotpSubmit} className="space-y-4">
            {errors.totpToken && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {errors.totpToken}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="totp-token">Authentication code</Label>
              <Input
                id="totp-token"
                name="totpToken"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                autoComplete="one-time-code"
                autoFocus
                value={totpToken}
                onChange={(e) => setTotpToken(e.target.value.replace(/\D/g, ""))}
                disabled={isLoading}
                className="text-center font-mono tracking-widest"
                aria-invalid={!!errors.totpToken}
              />
            </div>

            <Button type="submit" className="w-full" disabled={isLoading || totpToken.length !== 6}>
              {isLoading ? "Verifying…" : "Verify"}
            </Button>

            <button
              type="button"
              onClick={() => { setPendingToken(null); setTotpToken(""); setErrors({}); }}
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back to login
            </button>
          </form>
        </CardContent>
      </Card>
    );
  }

  // --- Standard Login Step ---
  return (
    <Card className="border-border">
      <CardHeader className="space-y-1 text-center">
        <h1 className="text-xl font-semibold tracking-tight">
          Sign in to Vexlyx
        </h1>
        <p className="text-sm text-muted-foreground">
          Enter your credentials to access the panel
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {errors.root && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errors.root}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              name="email"
              type="email"
              placeholder="admin@example.com"
              autoComplete="email"
              autoFocus
              disabled={isLoading}
              aria-invalid={!!errors.email}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="login-password">Password</Label>
            <Input
              id="login-password"
              name="password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              disabled={isLoading}
              aria-invalid={!!errors.password}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password}</p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading}
          >
            {isLoading ? "Signing in…" : "Sign in"}
          </Button>

          <div className="text-center">
            <Link
              href="/forgot-password"
              className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              Forgot your password?
            </Link>
          </div>
        </form>

        {allowRegistration && (
          <div className="mt-4 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Create one
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
