-- CreateEnum
CREATE TYPE "DnsMode" AS ENUM ('CONNECTED', 'MANAGED');

-- AlterTable
ALTER TABLE "domains" ADD COLUMN     "dns_mode" "DnsMode" NOT NULL DEFAULT 'CONNECTED';

-- Backfill: domains that already have records beyond the auto-created
-- verification TXT were being served by CoreDNS, so keep them MANAGED.
UPDATE "domains" SET "dns_mode" = 'MANAGED'
WHERE EXISTS (
  SELECT 1 FROM "dns_records" r
  WHERE r."domain_id" = "domains"."id"
    AND NOT (r."type" = 'TXT' AND r."name" LIKE '\_vexlyx-challenge.%')
);
