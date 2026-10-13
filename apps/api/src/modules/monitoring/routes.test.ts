import { describe, it, expect, vi, afterEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/vexlyx_test";
process.env.SESSION_SECRET ??= "test-session-secret-at-least-32-characters-long";

vi.mock("../../plugins/socket.js", () => ({ getIO: () => ({}) }));
vi.mock("./socket.js", () => ({
  registerMonitoringSocketHandlers: vi.fn(),
  runMetricsCollectorJob: vi.fn(),
}));
vi.mock("../../config/queue.js", () => ({
  createQueue: () => ({ upsertJobScheduler: vi.fn(async () => undefined) }),
  createWorker: () => ({}),
}));

const { monitoringRoutes } = await import("./routes.js");
const { MonitoringService } = await import("./service.js");

afterEach(() => vi.restoreAllMocks());

type Role = "ADMIN" | "RESELLER" | "USER";

const SESSIONS: Record<string, Role> = {
  "admin-session": "ADMIN",
  "reseller-session": "RESELLER",
  "user-session": "USER",
};

async function appFixture() {
  const app = Fastify();
  app.decorate("prisma", {} as PrismaClient);
  app.decorate("registerQueue", vi.fn() as unknown as FastifyInstance["registerQueue"]);
  app.decorate("requireAuth", vi.fn() as unknown as FastifyInstance["requireAuth"]);
  // Mirrors the real plugin: 401 without a session, 403 when the role is not allowed.
  app.decorate("requireRole", ((...roles: Role[]) =>
    async (
      request: { headers: Record<string, unknown> },
      reply: { status: (code: number) => { send: (body: unknown) => unknown } },
    ) => {
      const role = SESSIONS[String(request.headers.authorization)];
      if (!role) {
        return reply
          .status(401)
          .send({ error: "Authentication required", code: "UNAUTHORIZED", details: {} });
      }
      if (!roles.includes(role)) {
        return reply.status(403).send({
          error: "You do not have permission to perform this action",
          code: "FORBIDDEN_ROLE",
          details: {},
        });
      }
    }) as unknown as FastifyInstance["requireRole"]);
  await app.register(monitoringRoutes, { prefix: "/api/monitoring" });
  return app;
}

const ENDPOINTS = [
  { url: "/api/monitoring/server", method: "getServerMetrics" as const, result: { cpuPercent: 1 } },
  { url: "/api/monitoring/containers", method: "getContainerMetrics" as const, result: [] },
  { url: "/api/monitoring/history?range=24h", method: "getHistory" as const, result: [] },
];

describe.each(ENDPOINTS)("GET $url", ({ url, method, result }) => {
  it("rejects unauthenticated requests with 401", async () => {
    const spy = vi.spyOn(MonitoringService.prototype, method);
    const app = await appFixture();
    try {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(401);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it.each(["user-session", "reseller-session"])(
    "rejects non-admin (%s) with 403 and never touches host metrics",
    async (authorization) => {
      const spy = vi.spyOn(MonitoringService.prototype, method);
      const app = await appFixture();
      try {
        const res = await app.inject({ method: "GET", url, headers: { authorization } });
        expect(res.statusCode).toBe(403);
        expect(res.json().code).toBe("FORBIDDEN_ROLE");
        expect(spy).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    },
  );

  it("serves an admin", async () => {
    const spy = vi.spyOn(MonitoringService.prototype, method).mockResolvedValue(result as never);
    const app = await appFixture();
    try {
      const res = await app.inject({
        method: "GET",
        url,
        headers: { authorization: "admin-session" },
      });
      expect(res.statusCode).toBe(200);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
});
