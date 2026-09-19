"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchAPI } from "@/lib/api";
import type { DnsDelegationCheckResponse, DnsMode } from "@vexlyx/shared";

export function useDnsMode(domainId?: string) {
  const [delegation, setDelegation] = useState<DnsDelegationCheckResponse | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  const checkDelegation = useCallback(async (): Promise<DnsDelegationCheckResponse | null> => {
    if (!domainId) return null;
    setIsChecking(true);
    try {
      const result = await fetchAPI<DnsDelegationCheckResponse>(
        `/api/domains/${domainId}/dns-mode/check`,
        { method: "POST" },
      );
      setDelegation(result);
      return result;
    } finally {
      setIsChecking(false);
    }
  }, [domainId]);

  useEffect(() => {
    void checkDelegation().catch((err: unknown) => {
      console.error("Failed to check DNS delegation", err);
    });
  }, [checkDelegation]);

  const setMode = async (mode: DnsMode): Promise<void> => {
    if (!domainId) throw new Error("No domain selected");
    setIsSwitching(true);
    try {
      await fetchAPI(`/api/domains/${domainId}/dns-mode`, {
        method: "PATCH",
        body: JSON.stringify({ mode }),
      });
    } finally {
      setIsSwitching(false);
    }
  };

  return { delegation, isChecking, isSwitching, checkDelegation, setMode };
}
