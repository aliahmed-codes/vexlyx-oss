import type { PrismaClient, Prisma } from "@prisma/client";
import type { FastifyBaseLogger } from "fastify";
import type { AuditAction, AuditLogQuery } from "@vexlyx/shared";

// ---------------------------------------------------------------------------
// Metadata shape
// ---------------------------------------------------------------------------

interface AuditTarget {
  type: string;
  id: string;
}

// `before`/`after` must only ever hold an explicit whitelist of the fields
// that actually changed, assembled by the call site — never a raw request
// or database record. This is what keeps secrets (passwords, DB
// credentials, encrypted env vars) out of the audit trail.
interface AuditMetadata {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export class AuditLogService {
  constructor(
    private prisma: PrismaClient,
    private logger: FastifyBaseLogger,
  ) {}

  /**
   * Writes one audit entry. Only needs the actor's id — email and role are
   * looked up fresh here (not trusted from the caller/session) so every
   * call site stays a one-line addition regardless of which middleware ran.
   * Deliberately never throws into the caller's flow — a logging failure
   * must never block the underlying action (e.g. a firewall rule delete
   * succeeding) from completing. Failures are logged for operator
   * visibility instead.
   */
  async log(actorId: string, action: AuditAction, target: AuditTarget, metadata?: AuditMetadata): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: actorId },
        select: { email: true, role: true },
      });

      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorEmail: user?.email ?? "unknown",
          actorRole: user?.role ?? "USER",
          action,
          targetType: target.type,
          targetId: target.id,
          metadata: metadata ? (metadata as Prisma.InputJsonValue) : undefined,
        },
      });
    } catch (err) {
      this.logger.error({ err, action, target }, "Failed to write audit log entry");
    }
  }

  async list(filters: Omit<AuditLogQuery, "page" | "pageSize">, pagination: { page: number; pageSize: number }) {
    const where: Prisma.AuditLogWhereInput = {
      ...(filters.actorId && { actorId: filters.actorId }),
      ...(filters.action && { action: filters.action }),
      ...(filters.targetType && { targetType: filters.targetType }),
      ...((filters.dateFrom || filters.dateTo) && {
        createdAt: {
          ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
          ...(filters.dateTo && { lte: new Date(filters.dateTo) }),
        },
      }),
    };

    const [total, entries] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize,
      }),
    ]);

    return { entries, total, page: pagination.page, pageSize: pagination.pageSize };
  }
}
