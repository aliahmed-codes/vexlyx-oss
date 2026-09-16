import type { Metadata } from "next";
import { AuditLogPage } from "@/components/audit-log/AuditLogPage";

export const metadata: Metadata = {
  title: "Audit Log — Vexlyx",
  description: "Review who changed roles, quotas, firewall rules, and other security-sensitive actions.",
};

/**
 * /audit-log — F5.18 Audit Log page. Admin-only; the API also enforces this
 * independently.
 */
export default function AuditLogPageRoute() {
  return <AuditLogPage />;
}
