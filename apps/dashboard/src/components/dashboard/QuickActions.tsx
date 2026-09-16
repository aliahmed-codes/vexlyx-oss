import Link from "next/link";
import { FolderPlus, Globe, Database, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

const ACTIONS = [
  { label: "New Project", href: "/projects", icon: FolderPlus },
  { label: "New Domain", href: "/domains", icon: Globe },
  { label: "New Database", href: "/databases", icon: Database },
  { label: "New Mailbox", href: "/mail", icon: Mail },
] as const;

/**
 * Quick-action links to each resource's list page (F5.16) — creation itself
 * is modal-based on those pages, so these are plain links, not deep links.
 */
export function QuickActions() {
  return (
    <div className="flex flex-wrap gap-3">
      {ACTIONS.map(({ label, href, icon: Icon }) => (
        <Button key={href} variant="outline" size="sm" className="gap-1.5" asChild>
          <Link href={href}>
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        </Button>
      ))}
    </div>
  );
}
