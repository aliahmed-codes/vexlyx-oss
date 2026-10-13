import { describe, it, expect, vi, afterEach } from "vitest";
import Fastify from "fastify";
import type { PrismaClient } from "@prisma/client";

process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/vexlyx_test";
process.env.SESSION_SECRET ??= "test-session-secret-at-least-32-characters-long";

const { projectRoutes } = await import("./routes.js");
const { ProjectService } = await import("./service.js");
const { errorHandlerPlugin } = await import("../../plugins/error-handler.js");

afterEach(() => vi.restoreAllMocks());

async function appFixture() {
  const app = Fastify();
  app.decorate("prisma", {} as PrismaClient);
  app.decorate("requireAuth", async (request, reply) => {
    if (request.headers.authorization !== "test-session") {
      return reply
        .status(401)
        .send({ error: "Unauthorized", code: "UNAUTHORIZED", details: {} });
    }
    request.userId = "u1";
  });
  await app.register(errorHandlerPlugin);
  await app.register(projectRoutes, { prefix: "/api/projects" });
  return app;
}

const AUTH = { authorization: "test-session" };
const EVIL_URLS = ["file:///etc", "http://169.254.169.254/latest/meta-data/"];

describe("POST /api/projects git URL validation (#62)", () => {
  it("requires authentication", async () => {
    const create = vi.spyOn(ProjectService.prototype, "create");
    const app = await appFixture();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects",
        payload: { name: "my-app", type: "NODEJS", gitUrl: "https://github.com/acme/app" },
      });
      expect(res.statusCode).toBe(401);
      expect(create).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it.each(EVIL_URLS)("rejects %s with 400 before reaching the service", async (gitUrl) => {
    const create = vi.spyOn(ProjectService.prototype, "create");
    const app = await appFixture();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects",
        headers: AUTH,
        payload: { name: "my-app", type: "NODEJS", gitUrl },
      });
      expect(res.statusCode).toBe(400);
      expect(create).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("creates the project for an allow-listed URL", async () => {
    const create = vi
      .spyOn(ProjectService.prototype, "create")
      .mockResolvedValue({ id: "p1" } as never);
    const app = await appFixture();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects",
        headers: AUTH,
        payload: { name: "my-app", type: "NODEJS", gitUrl: "https://github.com/acme/app" },
      });
      expect(res.statusCode).toBe(201);
      expect(create).toHaveBeenCalledWith(
        "u1",
        expect.objectContaining({ gitUrl: "https://github.com/acme/app" }),
      );
    } finally {
      await app.close();
    }
  });
});

describe("PUT /api/projects/:id git URL validation (#62)", () => {
  it.each(EVIL_URLS)("rejects %s with 400 before reaching the service", async (gitUrl) => {
    const update = vi.spyOn(ProjectService.prototype, "update");
    const app = await appFixture();
    try {
      const res = await app.inject({
        method: "PUT",
        url: "/api/projects/p1",
        headers: AUTH,
        payload: { gitUrl },
      });
      expect(res.statusCode).toBe(400);
      expect(update).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
