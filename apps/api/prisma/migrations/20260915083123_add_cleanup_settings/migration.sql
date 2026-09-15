-- CreateEnum
CREATE TYPE "CleanupStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "CleanupTrigger" AS ENUM ('SCHEDULED', 'MANUAL', 'REDEPLOY');

-- CreateTable
CREATE TABLE "cleanup_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "schedule_enabled" BOOLEAN NOT NULL DEFAULT false,
    "schedule_cron" TEXT NOT NULL DEFAULT '0 4 * * *',
    "prune_after_redeploy" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cleanup_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cleanup_runs" (
    "id" TEXT NOT NULL,
    "trigger" "CleanupTrigger" NOT NULL,
    "status" "CleanupStatus" NOT NULL DEFAULT 'RUNNING',
    "containers_removed" INTEGER,
    "images_removed" INTEGER,
    "reclaimed_bytes" BIGINT,
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "cleanup_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cleanup_runs_started_at_idx" ON "cleanup_runs"("started_at");
