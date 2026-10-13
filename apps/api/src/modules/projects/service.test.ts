import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConnectRepoSchema,
  CreateProjectSchema,
  UpdateProjectSchema,
} from "@vexlyx/shared";
import type { PrismaClient } from "@prisma/client";
import type { FastifyBaseLogger } from "fastify";
import type { AuditLogService } from "../audit-log/service.js";

vi.mock("../../config/env.js", () => ({ env: {} }));
vi.mock("../../utils/quota.js", () => ({
  assertUnderQuota: vi.fn(),
  notifyQuotaThreshold: vi.fn(),
}));
vi.mock("../deploy/service.js", () => ({ runDockerAction: vi.fn() }));
import { ProjectService } from "./service.js";

describe("project Git URL policy", () => {
  it.each([
    "file:///private/repository",
    "http://169.254.169.254/repo",
    "https://example.com/team/repo",
    "ssh://internal/team/repo",
    "git://github.com/team/repo",
    "https://github.com:8080/team/repo",
    "https://github.com@localhost/team/repo",
    "https://github.com.evil.example/team/repo",
    "https://github.com/team/repo\n",
    "https://github.com\\@localhost/team/repo",
  ])("rejects an unsafe URL through every schema: %s", (gitUrl) => {
    expect(
      CreateProjectSchema.safeParse({ name: "test", type: "NODEJS", gitUrl })
        .success,
    ).toBe(false);
    expect(UpdateProjectSchema.safeParse({ gitUrl }).success).toBe(false);
    expect(ConnectRepoSchema.safeParse({ gitUrl }).success).toBe(false);
  });

  it.each([
    "https://github.com/team/repo.git",
    "https://gitlab.com/team/group/repo",
    "git@bitbucket.org:team/repo.git",
  ])("accepts supported repositories: %s", (gitUrl) => {
    expect(
      CreateProjectSchema.safeParse({ name: "test", type: "NODEJS", gitUrl })
        .success,
    ).toBe(true);
    expect(UpdateProjectSchema.safeParse({ gitUrl }).success).toBe(true);
    expect(ConnectRepoSchema.safeParse({ gitUrl }).success).toBe(true);
  });

  it("allows projects without a repository", () => {
    expect(
      CreateProjectSchema.safeParse({ name: "test", type: "STATIC" }).success,
    ).toBe(true);
    expect(UpdateProjectSchema.safeParse({ gitUrl: "" }).success).toBe(true);
  });
});

describe("project repository changes", () => {
  const project = {
    id: "p1",
    userId: "u1",
    deletedAt: null,
    gitUrl: "https://github.com/team/old",
  };
  const prisma = { project: { findUnique: vi.fn(), update: vi.fn() } };
  const service = new ProjectService(
    prisma as unknown as PrismaClient,
    {} as AuditLogService,
    {} as FastifyBaseLogger,
  );
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.project.findUnique.mockResolvedValue(project);
    prisma.project.update.mockResolvedValue(project);
  });

  it.each(["https://gitlab.com/team/new", ""])(
    "clears GitHub linkage when the repository changes: %s",
    async (gitUrl) => {
      await service.update("u1", "p1", { gitUrl });
      expect(prisma.project.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            gitUrl: gitUrl || null,
            githubInstallationId: null,
            githubRepoId: null,
            githubRepoFullName: null,
            githubConnectionStatus: null,
            githubDisconnectReason: null,
          }),
        }),
      );
    },
  );

  it("preserves linkage when the repository is unchanged", async () => {
    await service.update("u1", "p1", { gitUrl: project.gitUrl });
    expect(prisma.project.update.mock.calls[0]![0].data).not.toHaveProperty(
      "githubInstallationId",
    );
  });

  it("rejects another owner's update before writing", async () => {
    await expect(
      service.update("other", "p1", { gitUrl: "https://github.com/team/new" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(prisma.project.update).not.toHaveBeenCalled();
  });
});
