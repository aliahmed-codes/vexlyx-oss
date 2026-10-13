import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { FastifyBaseLogger } from "fastify";
import type { AuditLogService } from "../audit-log/service.js";

process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/vexlyx_test";
process.env.SESSION_SECRET ??= "test-session-secret-at-least-32-characters-long";
const { ProjectService } = await import("./service.js");

const USER_ID = "u1";
const PROJECT_ID = "p1";
const GITHUB_URL = "https://github.com/acme/app.git";

const CLEARED = {
  githubInstallationId: null,
  githubRepoId: null,
  githubRepoFullName: null,
  githubConnectionStatus: null,
  githubDisconnectReason: null,
};

function fixture(gitUrl: string | null = GITHUB_URL) {
  const stored = {
    id: PROJECT_ID,
    userId: USER_ID,
    name: "my-app",
    gitUrl,
    deletedAt: null,
  };
  const prisma = {
    project: {
      findUnique: vi.fn().mockResolvedValue(stored),
      update: vi.fn().mockImplementation(async ({ data }) => ({ ...stored, ...data })),
    },
  };
  const service = new ProjectService(
    prisma as unknown as PrismaClient,
    { log: vi.fn() } as unknown as AuditLogService,
    {} as FastifyBaseLogger,
  );
  return { prisma, service };
}

function updateData(prisma: ReturnType<typeof fixture>["prisma"]) {
  return prisma.project.update.mock.calls[0]![0].data as Record<string, unknown>;
}

describe("ProjectService.update — GitHub App link follows the repository URL (#62)", () => {
  it("clears the GitHub link when gitUrl is repointed at a different repository", async () => {
    const { prisma, service } = fixture();

    await service.update(USER_ID, PROJECT_ID, { gitUrl: "https://github.com/acme/other.git" });

    expect(updateData(prisma)).toMatchObject({
      gitUrl: "https://github.com/acme/other.git",
      ...CLEARED,
    });
  });

  it("clears the GitHub link when gitUrl is removed", async () => {
    const { prisma, service } = fixture();

    await service.update(USER_ID, PROJECT_ID, { gitUrl: "" });

    expect(updateData(prisma)).toMatchObject({ gitUrl: null, ...CLEARED });
  });

  it("keeps the GitHub link when the submitted gitUrl is unchanged", async () => {
    const { prisma, service } = fixture();

    await service.update(USER_ID, PROJECT_ID, { gitUrl: GITHUB_URL, branch: "develop" });

    const data = updateData(prisma);
    expect(data).toMatchObject({ gitUrl: GITHUB_URL, branch: "develop" });
    expect(data).not.toHaveProperty("githubInstallationId");
  });

  it("keeps the GitHub link when gitUrl is not part of the update", async () => {
    const { prisma, service } = fixture();

    await service.update(USER_ID, PROJECT_ID, { buildCmd: "pnpm build" });

    const data = updateData(prisma);
    expect(data).toMatchObject({ buildCmd: "pnpm build" });
    expect(data).not.toHaveProperty("gitUrl");
    expect(data).not.toHaveProperty("githubInstallationId");
  });
});
