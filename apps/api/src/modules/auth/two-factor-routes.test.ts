import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";

process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/vexlyx_test";
process.env.SESSION_SECRET ??= "test-session-secret-at-least-32-characters-long";

describe("POST /api/auth/2fa/challenge rate limit + shape", () => {
  it("rejects unknown challenge with 401 2FA_INVALID_CODE", async () => {
    const { authRoutes } = await import("./routes.js");
    const app = Fastify();
    app.decorate("prisma", { user: { findUnique: vi.fn() } } as unknown as import("fastify").FastifyInstance["prisma"]);
    app.decorate("redis", { get: vi.fn(async () => null), set: vi.fn(), del: vi.fn() } as unknown as import("fastify").FastifyInstance["redis"]);
    app.decorate("requireAuth", vi.fn() as unknown as import("fastify").FastifyInstance["requireAuth"]);
    await app.register(authRoutes, { prefix: "/api/auth" });
    const res = await app.inject({ method: "POST", url: "/api/auth/2fa/challenge", payload: { challengeToken: "x".repeat(64), code: "123456" } });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("2FA_INVALID_CODE");
  }, 30_000);
});
