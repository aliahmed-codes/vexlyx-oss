-- CreateEnum
CREATE TYPE "Permission" AS ENUM ('canManageDns', 'canManageFirewall', 'canManageBackups', 'canCreateSubAccounts');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "permissions" "Permission"[] DEFAULT ARRAY[]::"Permission"[];
