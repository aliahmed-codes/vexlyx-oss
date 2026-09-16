import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { FastifyBaseLogger } from "fastify";
import { AuditLogService } from "./service.js";

interface PrismaMock {
  user: { findUnique: ReturnType<typeof vi.fn> };
  auditLog: {
    create: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
}

function createPrismaMock(): PrismaMock {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue({ email: "admin@vexlyx.local", role: "ADMIN" }),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

const errorLogger = { error: vi.fn() } as unknown as FastifyBaseLogger;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AuditLogService.log", () => {
  it("writes an entry with a denormalized actor email/role snapshot", async () => {
    const prisma = createPrismaMock();
    const service = new AuditLogService(prisma as unknown as PrismaClient, errorLogger);

    await service.log("user-1", "user.role_changed", { type: "User", id: "user-2" }, {
      before: { role: "USER" },
      after: { role: "ADMIN" },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: "user-1",
        actorEmail: "admin@vexlyx.local",
        actorRole: "ADMIN",
        action: "user.role_changed",
        targetType: "User",
        targetId: "user-2",
        metadata: { before: { role: "USER" }, after: { role: "ADMIN" } },
      }),
    });
  });

  it("falls back to a placeholder actor when the user lookup finds nothing (deleted actor)", async () => {
    const prisma = createPrismaMock();
    prisma.user.findUnique.mockResolvedValue(null);
    const service = new AuditLogService(prisma as unknown as PrismaClient, errorLogger);

    await service.log("deleted-user", "user.deleted", { type: "User", id: "user-3" });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorEmail: "unknown", actorRole: "USER" }),
    });
  });

  it("never throws when the write fails, and logs the failure instead", async () => {
    const prisma = createPrismaMock();
    prisma.auditLog.create.mockRejectedValue(new Error("db unavailable"));
    const service = new AuditLogService(prisma as unknown as PrismaClient, errorLogger);

    await expect(
      service.log("user-1", "firewall.rule_deleted", { type: "FirewallRule", id: "rule-1" }),
    ).resolves.toBeUndefined();
    expect(errorLogger.error).toHaveBeenCalled();
  });
});

describe("AuditLogService.list", () => {
  it("applies actor/action/date filters and paginates", async () => {
    const prisma = createPrismaMock();
    prisma.auditLog.count.mockResolvedValue(42);
    const service = new AuditLogService(prisma as unknown as PrismaClient, errorLogger);

    const result = await service.list(
      { actorId: "user-1", action: "user.deleted", targetType: undefined, dateFrom: "2026-01-01T00:00:00.000Z", dateTo: undefined },
      { page: 2, pageSize: 10 },
    );

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          actorId: "user-1",
          action: "user.deleted",
          createdAt: { gte: new Date("2026-01-01T00:00:00.000Z") },
        }),
        skip: 10,
        take: 10,
      }),
    );
    expect(result.total).toBe(42);
    expect(result.page).toBe(2);
  });
});
