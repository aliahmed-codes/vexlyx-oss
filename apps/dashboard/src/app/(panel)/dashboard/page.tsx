import type { Metadata } from "next";
import { DashboardOverview } from "@/components/dashboard/DashboardOverview";

export const metadata: Metadata = {
  title: "Dashboard",
};

/**
 * Dashboard home page — real stat counts, server health, recent activity,
 * and quick actions (F5.16), fetched by the client-side DashboardOverview.
 */
export default function DashboardPage() {
  return <DashboardOverview />;
}
