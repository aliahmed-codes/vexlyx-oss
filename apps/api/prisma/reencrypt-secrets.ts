import { PrismaClient } from "@prisma/client";
import { decryptWithMeta, encrypt } from "../src/utils/encryption.js";

/**
 * Re-encrypts every value that is still readable only through the legacy
 * SESSION_SECRET-derived key under the current ENCRYPTION_KEY (#69).
 *
 * Run once after setting ENCRYPTION_KEY on an install that previously ran
 * without one, with ENCRYPTION_KEY_LEGACY_FALLBACK=true:
 *
 *   pnpm exec tsx prisma/reencrypt-secrets.ts            # apply
 *   pnpm exec tsx prisma/reencrypt-secrets.ts --dry-run  # report only
 *
 * Idempotent: values already under the current key are left untouched, and
 * a value that cannot be decrypted by either key is reported, never changed.
 */
const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

interface Column {
  label: string;
  load: () => Promise<Array<{ id: string; value: string | null }>>;
  save: (id: string, value: string) => Promise<unknown>;
}

const columns: Column[] = [
  {
    label: "User.totpSecretEncrypted",
    load: async () =>
      (await prisma.user.findMany({ select: { id: true, totpSecretEncrypted: true } })).map((r) => ({
        id: r.id,
        value: r.totpSecretEncrypted,
      })),
    save: (id, value) => prisma.user.update({ where: { id }, data: { totpSecretEncrypted: value } }),
  },
  {
    label: "Database.dbPassword",
    load: async () =>
      (await prisma.database.findMany({ select: { id: true, dbPassword: true } })).map((r) => ({
        id: r.id,
        value: r.dbPassword,
      })),
    save: (id, value) => prisma.database.update({ where: { id }, data: { dbPassword: value } }),
  },
  {
    label: "Certificate.encryptedKey",
    load: async () =>
      (await prisma.certificate.findMany({ select: { id: true, encryptedKey: true } })).map((r) => ({
        id: r.id,
        value: r.encryptedKey,
      })),
    save: (id, value) => prisma.certificate.update({ where: { id }, data: { encryptedKey: value } }),
  },
  {
    label: "EnvVar.value",
    load: async () =>
      (await prisma.envVar.findMany({ select: { id: true, value: true } })).map((r) => ({
        id: r.id,
        value: r.value,
      })),
    save: (id, value) => prisma.envVar.update({ where: { id }, data: { value } }),
  },
  {
    label: "SftpUser.encryptedPassword",
    load: async () =>
      (await prisma.sftpUser.findMany({ select: { id: true, encryptedPassword: true } })).map((r) => ({
        id: r.id,
        value: r.encryptedPassword,
      })),
    save: (id, value) => prisma.sftpUser.update({ where: { id }, data: { encryptedPassword: value } }),
  },
  {
    label: "GitHubApp.encryptedClientSecret",
    load: async () =>
      (await prisma.gitHubApp.findMany({ select: { id: true, encryptedClientSecret: true } })).map((r) => ({
        id: r.id,
        value: r.encryptedClientSecret,
      })),
    save: (id, value) => prisma.gitHubApp.update({ where: { id }, data: { encryptedClientSecret: value } }),
  },
  {
    label: "GitHubApp.encryptedPrivateKey",
    load: async () =>
      (await prisma.gitHubApp.findMany({ select: { id: true, encryptedPrivateKey: true } })).map((r) => ({
        id: r.id,
        value: r.encryptedPrivateKey,
      })),
    save: (id, value) => prisma.gitHubApp.update({ where: { id }, data: { encryptedPrivateKey: value } }),
  },
  {
    label: "GitHubApp.encryptedWebhookSecret",
    load: async () =>
      (await prisma.gitHubApp.findMany({ select: { id: true, encryptedWebhookSecret: true } })).map((r) => ({
        id: r.id,
        value: r.encryptedWebhookSecret,
      })),
    save: (id, value) => prisma.gitHubApp.update({ where: { id }, data: { encryptedWebhookSecret: value } }),
  },
];

async function main() {
  let migrated = 0;
  let current = 0;
  let unreadable = 0;

  for (const column of columns) {
    for (const row of await column.load()) {
      if (!row.value) continue;
      try {
        const { plainText, legacy } = decryptWithMeta(row.value);
        if (!legacy) {
          current += 1;
          continue;
        }
        if (!dryRun) await column.save(row.id, encrypt(plainText));
        migrated += 1;
      } catch {
        // Not our format (e.g. the SFTP raw-slice legacy form) or corrupted:
        // leave it alone and say so rather than risk overwriting it.
        unreadable += 1;
        console.error(`Could not decrypt ${column.label} row ${row.id}; left unchanged.`);
      }
    }
  }

  console.log(
    `${dryRun ? "[dry run] would re-encrypt" : "Re-encrypted"} ${migrated} value(s); ` +
      `${current} already on the current key; ${unreadable} unreadable.`,
  );
  if (unreadable > 0) process.exitCode = 1;
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
