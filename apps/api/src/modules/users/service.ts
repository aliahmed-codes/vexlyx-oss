import type { PrismaClient, Role } from "@prisma/client";
import * as argon2 from "argon2";
import type { CreateSubAccountInput, UpdateUserRoleInput, UpdateUserQuotasInput } from "./schema.js";
import { assertUnderQuota, getUsageSummary } from "../../utils/quota.js";
import type { AuditLogService } from "../audit-log/service.js";

export class UserError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "UserError";
  }
}

const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  resellerId: true,
  maxProjects: true,
  maxDomains: true,
  maxDatabases: true,
  maxMailboxes: true,
  maxSubAccounts: true,
  createdAt: true,
} as const;

interface Requester {
  id: string;
  role: Role;
}

export class UserService {
  constructor(
    private prisma: PrismaClient,
    private auditLog: AuditLogService,
  ) {}

  /**
   * Used/limit breakdown for every quota'd resource, for the caller's own
   * account — powers the "Your Plan" dashboard widget.
   */
  async getUsageSummary(userId: string) {
    return getUsageSummary(this.prisma, userId);
  }

  /**
   * ADMIN sees every user; RESELLER sees only themselves and their own
   * sub-accounts (F5.5 reseller scoping).
   */
  async list(requester: Requester) {
    const where = requester.role === "ADMIN" ? {} : { OR: [{ id: requester.id }, { resellerId: requester.id }] };

    return this.prisma.user.findMany({
      where,
      select: PUBLIC_USER_SELECT,
      orderBy: { createdAt: "asc" },
    });
  }

  // Role changes are ADMIN-only, always — never callable by a RESELLER, so
  // no ownership check is needed here (unlike updateQuotas/delete below).
  async updateRole(requester: Requester, id: string, data: UpdateUserRoleInput) {
    const target = await this.ensureExists(id);

    const updated = await this.prisma.user.update({
      where: { id },
      data: { role: data.role },
      select: PUBLIC_USER_SELECT,
    });

    await this.auditLog.log(
      requester.id,
      "user.role_changed",
      { type: "User", id },
      { before: { role: target.role }, after: { role: data.role } },
    );

    return updated;
  }

  /**
   * ADMIN can update any user's quotas; RESELLER can only update quotas on
   * their own sub-accounts (never themselves, another reseller, or admin).
   */
  async updateQuotas(requester: Requester, id: string, data: UpdateUserQuotasInput) {
    const target = await this.ensureExists(id);
    this.assertCanManage(requester, target);

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: PUBLIC_USER_SELECT,
    });

    await this.auditLog.log(
      requester.id,
      "user.quotas_changed",
      { type: "User", id },
      {
        before: {
          maxProjects: target.maxProjects,
          maxDomains: target.maxDomains,
          maxDatabases: target.maxDatabases,
          maxMailboxes: target.maxMailboxes,
          maxSubAccounts: target.maxSubAccounts,
        },
        after: data,
      },
    );

    return updated;
  }

  /**
   * ADMIN can delete any user (but not themselves); RESELLER can only
   * delete their own sub-accounts.
   */
  async delete(requester: Requester, id: string) {
    if (id === requester.id) {
      throw new UserError("You cannot delete your own account", "CANNOT_DELETE_SELF", 400);
    }

    const target = await this.ensureExists(id);
    this.assertCanManage(requester, target);

    await this.prisma.user.delete({ where: { id } });

    await this.auditLog.log(
      requester.id,
      "user.deleted",
      { type: "User", id },
      { before: { email: target.email, role: target.role } },
    );
  }

  /**
   * ADMIN may manage anyone; RESELLER may only manage a USER they own
   * (their own sub-account) — never another reseller's account, an admin,
   * or a user that isn't theirs.
   */
  private assertCanManage(requester: Requester, target: { id: string; resellerId: string | null }) {
    if (requester.role === "ADMIN") return;

    if (target.resellerId !== requester.id) {
      throw new UserError("You can only manage your own sub-accounts", "FORBIDDEN", 403);
    }
  }

  /**
   * ADMIN creates a user of any role directly; RESELLER creates a USER
   * sub-account under themselves, gated by their own maxSubAccounts quota.
   */
  async createSubAccount(requester: Requester, data: CreateSubAccountInput) {
    const isAdmin = requester.role === "ADMIN";

    if (!isAdmin) {
      await assertUnderQuota(
        this.prisma,
        requester.id,
        "subAccount",
        (message, code, statusCode) => new UserError(message, code, statusCode),
      );
    }

    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new UserError("Email already registered", "EMAIL_EXISTS", 409);
    }

    const hashedPassword = await argon2.hash(data.password, { type: argon2.argon2id });

    const created = await this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        password: hashedPassword,
        role: isAdmin ? (data.role ?? "USER") : "USER",
        resellerId: isAdmin ? null : requester.id,
      },
      select: PUBLIC_USER_SELECT,
    });

    await this.auditLog.log(requester.id, "user.created", { type: "User", id: created.id }, {
      after: { email: created.email, role: created.role },
    });

    return created;
  }

  private async ensureExists(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        resellerId: true,
        maxProjects: true,
        maxDomains: true,
        maxDatabases: true,
        maxMailboxes: true,
        maxSubAccounts: true,
      },
    });
    if (!user) {
      throw new UserError("User not found", "USER_NOT_FOUND", 404);
    }
    return user;
  }
}
