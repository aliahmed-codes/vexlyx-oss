-- AlterTable: add password-reset token fields to users (F5.23)
ALTER TABLE "users" ADD COLUMN "reset_token" TEXT;
ALTER TABLE "users" ADD COLUMN "reset_token_expires_at" TIMESTAMPTZ;
