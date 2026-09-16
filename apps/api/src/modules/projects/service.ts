import type { PrismaClient } from "@prisma/client";
import type { CreateProjectInput, UpdateProjectInput, ProjectListQuery } from "./schema.js";
import { assertUnderQuota } from "../../utils/quota.js";
import type { AuditLogService } from "../audit-log/service.js";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ProjectError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "ProjectError";
  }
}

// ---------------------------------------------------------------------------
// Select shape — excludes deletedAt from all public responses
// ---------------------------------------------------------------------------

const PROJECT_SELECT = {
  id: true,
  name: true,
  type: true,
  status: true,
  gitUrl: true,
  branch: true,
  buildCmd: true,
  startCmd: true,
  port: true,
  userId: true,
  containerId: true,
  containerStatus: true,
  internalPort: true,
  deployedDomain: true,
  deployedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ProjectService {
  constructor(
    private prisma: PrismaClient,
    private auditLog: AuditLogService,
  ) {}

  async list(userId: string, query: ProjectListQuery) {
    const { page, limit, type, status, search } = query;
    const skip = (page - 1) * limit;

    const where = {
      userId,
      // Exclude soft-deleted projects from all list results
      status: status ?? { not: "DELETED" as const },
      ...(type && { type }),
      ...(search && {
        name: { contains: search, mode: "insensitive" as const },
      }),
    };

    const [projects, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        select: PROJECT_SELECT,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.project.count({ where }),
    ]);

    return {
      projects,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getById(userId: string, projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ...PROJECT_SELECT, deletedAt: true },
    });

    if (!project || project.deletedAt !== null) {
      throw new ProjectError("Project not found", "PROJECT_NOT_FOUND", 404);
    }

    if (project.userId !== userId) {
      throw new ProjectError(
        "You do not have access to this project",
        "FORBIDDEN",
        403,
      );
    }

    // Strip deletedAt before returning
    const { deletedAt: _deleted, ...publicProject } = project;
    return publicProject;
  }

  async create(userId: string, data: CreateProjectInput) {
    await assertUnderQuota(
      this.prisma,
      userId,
      "project",
      (message, code, statusCode) => new ProjectError(message, code, statusCode),
    );

    // Check for duplicate name within this user's projects
    const existing = await this.prisma.project.findUnique({
      where: { userId_name: { userId, name: data.name } },
      select: { id: true, status: true },
    });

    if (existing) {
      if (existing.status !== "DELETED") {
        throw new ProjectError(
          `A project named "${data.name}" already exists`,
          "PROJECT_NAME_EXISTS",
          409,
        );
      }

      // If an old soft-deleted project occupied this name, remove it to allow re-creation
      await this.prisma.project.delete({
        where: { id: existing.id },
      });
    }

    try {
      const project = await this.prisma.project.create({
        data: {
          userId,
          name: data.name,
          type: data.type,
          // Start as ACTIVE — build engine (F1.4) will manage CREATING→ACTIVE later
          status: "ACTIVE",
          gitUrl: data.gitUrl || null,
          branch: data.branch,
          buildCmd: data.buildCmd ?? null,
          startCmd: data.startCmd ?? null,
          port: data.port ?? null,
        },
        select: PROJECT_SELECT,
      });

      await this.auditLog.log(userId, "project.created", { type: "Project", id: project.id }, {
        after: { name: project.name, type: project.type },
      });

      return project;
    } catch (err: unknown) {
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        err.code === "P2002"
      ) {
        throw new ProjectError(
          `A project named "${data.name}" already exists`,
          "PROJECT_NAME_EXISTS",
          409,
        );
      }
      throw err;
    }
  }

  async update(userId: string, projectId: string, data: UpdateProjectInput) {
    // Verify ownership first
    await this.getById(userId, projectId);

    // If name is changing, check it won't collide with another project
    if (data.name) {
      const collision = await this.prisma.project.findUnique({
        where: { userId_name: { userId, name: data.name } },
        select: { id: true, status: true },
      });

      if (collision && collision.id !== projectId) {
        if (collision.status !== "DELETED") {
          throw new ProjectError(
            `A project named "${data.name}" already exists`,
            "PROJECT_NAME_EXISTS",
            409,
          );
        }
        // If colliding record was soft-deleted, clean it up
        await this.prisma.project.delete({
          where: { id: collision.id },
        });
      }
    }

    try {
      const updated = await this.prisma.project.update({
        where: { id: projectId },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.gitUrl !== undefined && { gitUrl: data.gitUrl || null }),
          ...(data.branch !== undefined && { branch: data.branch }),
          ...(data.buildCmd !== undefined && { buildCmd: data.buildCmd }),
          ...(data.startCmd !== undefined && { startCmd: data.startCmd }),
          ...(data.port !== undefined && { port: data.port }),
        },
        select: PROJECT_SELECT,
      });

      return updated;
    } catch (err: unknown) {
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        err.code === "P2002"
      ) {
        throw new ProjectError(
          `A project named "${data.name}" already exists`,
          "PROJECT_NAME_EXISTS",
          409,
        );
      }
      throw err;
    }
  }

  async softDelete(userId: string, projectId: string) {
    // Verify ownership
    const project = await this.getById(userId, projectId);

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        status: "DELETED",
        deletedAt: new Date(),
      },
    });

    await this.auditLog.log(userId, "project.deleted", { type: "Project", id: projectId }, {
      before: { name: project.name, type: project.type },
    });
  }
}
