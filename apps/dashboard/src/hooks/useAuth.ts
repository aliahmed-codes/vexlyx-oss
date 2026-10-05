"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { fetchAPI } from "@/lib/api";
import type { User } from "@vexlyx/shared";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export function useAuth() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const fetchUser = useCallback(async () => {
    try {
      const data = await fetchAPI<{ user: User }>("/api/auth/me");
      setState({ user: data.user, isLoading: false, isAuthenticated: true });
    } catch {
      setState({ user: null, isLoading: false, isAuthenticated: false });
    }
  }, []);

  useEffect(() => {
    void fetchUser();
  }, [fetchUser]);

  // Returns { user } on direct success, or { requiresTotp: true, pendingToken } when 2FA is needed.
  const login = async (
    email: string,
    password: string,
  ): Promise<{ user: User } | { requiresTotp: true; pendingToken: string }> => {
    const data = await fetchAPI<
      { user: User } | { requiresTotp: true; pendingToken: string }
    >("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    if ("requiresTotp" in data && data.requiresTotp) {
      return data;
    }

    const { user } = data as { user: User };
    queryClient.clear();
    setState({ user, isLoading: false, isAuthenticated: true });
    router.push("/dashboard");
    return { user };
  };

  // Exchange a pending TOTP token for a real session.
  const verifyTotp = async (pendingToken: string, totpToken: string): Promise<User> => {
    const data = await fetchAPI<{ user: User }>("/api/auth/totp/verify-login", {
      method: "POST",
      body: JSON.stringify({ pendingToken, totpToken }),
    });
    queryClient.clear();
    setState({ user: data.user, isLoading: false, isAuthenticated: true });
    router.push("/dashboard");
    return data.user;
  };

  const register = async (
    name: string,
    email: string,
    password: string,
    confirmPassword: string,
  ) => {
    const data = await fetchAPI<{ user: User }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password, confirmPassword }),
    });
    queryClient.clear();
    setState({ user: data.user, isLoading: false, isAuthenticated: true });
    router.push("/dashboard");
    return data.user;
  };

  const changePassword = async (
    currentPassword: string,
    newPassword: string,
    confirmNewPassword: string,
  ) => {
    await fetchAPI("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword, confirmNewPassword }),
    });
  };

  // 2FA setup: generate a secret + QR code (does not yet enable 2FA)
  const totpSetup = async (): Promise<{ secret: string; qrCodeDataUrl: string; otpauthUrl: string }> => {
    return fetchAPI<{ secret: string; qrCodeDataUrl: string; otpauthUrl: string }>(
      "/api/auth/totp/setup",
      { method: "POST" },
    );
  };

  // 2FA enable: verify the first code and activate 2FA
  const totpEnable = async (token: string): Promise<void> => {
    await fetchAPI("/api/auth/totp/enable", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    await fetchUser();
  };

  // 2FA disable: confirm password and deactivate 2FA
  const totpDisable = async (password: string): Promise<void> => {
    await fetchAPI("/api/auth/totp/disable", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    await fetchUser();
  };

  // Password reset (F5.23)
  const forgotPassword = async (email: string): Promise<void> => {
    await fetchAPI("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  };

  const resetPassword = async (
    token: string,
    password: string,
    confirmPassword: string,
  ): Promise<void> => {
    await fetchAPI("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password, confirmPassword }),
    });
  };

  const logout = async () => {
    try {
      await fetchAPI("/api/auth/logout", { method: "POST" });
    } catch {
      // Even if the API call fails, clear local state
    }
    queryClient.clear();
    setState({ user: null, isLoading: false, isAuthenticated: false });
    router.push("/login");
  };

  return {
    ...state,
    login,
    verifyTotp,
    register,
    changePassword,
    totpSetup,
    totpEnable,
    totpDisable,
    forgotPassword,
    resetPassword,
    logout,
    refetch: fetchUser,
  };
}
