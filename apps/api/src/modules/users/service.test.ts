import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { UserService, UserError } from "./service.js";
import type { AuditLogService } from "../audit-log/service.js";

interface PrismaMock {
  user: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
}

const TARGET = {
  id: "user-2",
  email: "target@vexlyx.local",
  role: "USER",
  resellerId: null,
  maxProjects: null,
  maxDomains: null,
  maxDatabases: null,
  maxMailboxes: null,
  maxSubAccounts: null,
  permissions: [],
};

function createPrismaMock(): PrismaMock {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(TARGET),
      update: vi.fn().mockResolvedValue({ ...TARGET, permissions: ["canManageDns"] }),
    },
  };
}

function createAuditLogMock(): AuditLogService {
  return { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("UserService.updateRole", () => {
  it("rejects an ADMIN changing their own role, without touching the database", async () => {
    const prisma = createPrismaMock();
    const auditLog = createAuditLogMock();
    const service = new UserService(prisma as unknown as PrismaClient, auditLog);

    await expect(
      service.updateRole({ id: "admin-1", role: "ADMIN" }, "admin-1", { role: "USER" }),
    ).rejects.toMatchObject({ code: "CANNOT_CHANGE_OWN_ROLE" });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(auditLog.log).not.toHaveBeenCalled();
  });

  it("allows an ADMIN to change another user's role and logs it", async () => {
    const prisma = createPrismaMock();
    prisma.user.update.mockResolvedValue({ ...TARGET, role: "RESELLER" });
    const auditLog = createAuditLogMock();
    const service = new UserService(prisma as unknown as PrismaClient, auditLog);

    const result = await service.updateRole({ id: "admin-1", role: "ADMIN" }, "user-2", { role: "RESELLER" });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-2" },
      data: { role: "RESELLER" },
      select: expect.objectContaining({ role: true }),
    });
    expect(auditLog.log).toHaveBeenCalledWith(
      "admin-1",
      "user.role_changed",
      { type: "User", id: "user-2" },
      { before: { role: "USER" }, after: { role: "RESELLER" } },
    );
    expect(result.role).toBe("RESELLER");
  });
});

describe("UserService.updatePermissions", () => {
  it("grants a permission and writes an audit log entry with the before/after arrays", async () => {
    const prisma = createPrismaMock();
    const auditLog = createAuditLogMock();
    const service = new UserService(prisma as unknown as PrismaClient, auditLog);

    const result = await service.updatePermissions(
      { id: "admin-1", role: "ADMIN" },
      "user-2",
      { permissions: ["canManageDns"] },
    );

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-2" },
      data: { permissions: ["canManageDns"] },
      select: expect.objectContaining({ permissions: true }),
    });
    expect(auditLog.log).toHaveBeenCalledWith(
      "admin-1",
      "user.permissions_changed",
      { type: "User", id: "user-2" },
      { before: { permissions: [] }, after: { permissions: ["canManageDns"] } },
    );
    expect(result.permissions).toEqual(["canManageDns"]);
  });

  it("throws USER_NOT_FOUND when the target does not exist", async () => {
    const prisma = createPrismaMock();
    prisma.user.findUnique.mockResolvedValue(null);
    const auditLog = createAuditLogMock();
    const service = new UserService(prisma as unknown as PrismaClient, auditLog);

    await expect(
      service.updatePermissions({ id: "admin-1", role: "ADMIN" }, "missing", { permissions: [] }),
    ).rejects.toThrow(UserError);
    expect(auditLog.log).not.toHaveBeenCalled();
  });

  it("revokes a permission (empty array) and still logs the change", async () => {
    const prisma = createPrismaMock();
    prisma.user.findUnique.mockResolvedValue({ ...TARGET, permissions: ["canManageDns"] });
    prisma.user.update.mockResolvedValue({ ...TARGET, permissions: [] });
    const auditLog = createAuditLogMock();
    const service = new UserService(prisma as unknown as PrismaClient, auditLog);

    const result = await service.updatePermissions({ id: "admin-1", role: "ADMIN" }, "user-2", { permissions: [] });

    expect(auditLog.log).toHaveBeenCalledWith(
      "admin-1",
      "user.permissions_changed",
      { type: "User", id: "user-2" },
      { before: { permissions: ["canManageDns"] }, after: { permissions: [] } },
    );
    expect(result.permissions).toEqual([]);
  });
});
