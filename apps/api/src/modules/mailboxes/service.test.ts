import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { AuditLogService } from "../audit-log/service.js";

process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/vexlyx_test";
process.env.SESSION_SECRET ??= "test-session-secret-at-least-32-characters-long";

vi.mock("../../utils/quota.js", () => ({
  assertUnderQuota: vi.fn(async () => undefined),
  notifyQuotaThreshold: vi.fn(async () => undefined),
}));

const { MailboxService, MailboxError } = await import("./service.js");
const { MailService, MailError } = await import("../mail/service.js");

afterEach(() => vi.restoreAllMocks());

function fixture() {
  const prisma = {
    domain: {
      findFirst: vi.fn().mockResolvedValue({ id: "d1", hostname: "example.com" }),
    },
    mailbox: {
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(1),
      create: vi.fn().mockImplementation(async ({ data }) => ({
        id: "m1",
        ...data,
        status: "ACTIVE",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        domain: { hostname: "example.com" },
      })),
    },
  };
  const auditLog = { log: vi.fn() };
  const service = new MailboxService(
    prisma as unknown as PrismaClient,
    auditLog as unknown as AuditLogService,
  );
  return { prisma, auditLog, service };
}

const INPUT = { domainId: "d1", localPart: "alice", quota: 1024 as const };

describe("MailboxService.create — mail server sync (#51)", () => {
  it("creates the mailbox and audits it when the mail server sync succeeds", async () => {
    vi.spyOn(MailService.prototype, "syncVirtualDomains").mockResolvedValue({
      success: true,
      syncedCount: 1,
      domains: ["example.com"],
      mailboxesSynced: 1,
    });
    const { auditLog, service } = fixture();

    const result = await service.create("u1", INPUT);

    expect(result.mailbox.address).toBe("alice@example.com");
    expect(auditLog.log).toHaveBeenCalledWith(
      "u1",
      "mailbox.created",
      { type: "Mailbox", id: "m1" },
      expect.anything(),
    );
  });

  it("reports MAIL_SYNC_FAILED instead of a clean success when the map rebuild fails", async () => {
    vi.spyOn(MailService.prototype, "syncVirtualDomains").mockRejectedValue(
      new MailError("Failed to rebuild Postfix map 'virtual_mailbox_maps'", "POSTFIX_MAP_COMPILE_FAILED", 502),
    );
    const { prisma, service } = fixture();

    const err = await service.create("u1", INPUT).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(MailboxError);
    expect(err).toMatchObject({ code: "MAIL_SYNC_FAILED", statusCode: 502 });
    expect((err as Error).message).toContain("virtual_mailbox_maps");
    expect((err as Error).message).toContain("Sync");
    // The row exists; the user is told how to retry the sync rather than create again.
    expect(prisma.mailbox.create).toHaveBeenCalledTimes(1);
  });
});
