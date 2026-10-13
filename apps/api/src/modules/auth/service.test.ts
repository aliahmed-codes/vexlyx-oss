import { beforeEach, describe, expect, it, vi } from "vitest";
import * as argon2 from "argon2";
import type { PrismaClient } from "@prisma/client";

process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/vexlyx_test";
process.env.SESSION_SECRET ??= "test-session-secret-at-least-32-characters-long";

vi.mock("../system-email/notifier.js", () => ({ notifyUser: vi.fn() }));

// Real argon2 underneath (so hashes/verifies are genuine) wrapped in spies.
const { hashSpy, verifySpy } = vi.hoisted(() => ({
  hashSpy: vi.fn(),
  verifySpy: vi.fn(),
}));
vi.mock("argon2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("argon2")>();
  hashSpy.mockImplementation(actual.hash);
  verifySpy.mockImplementation(actual.verify);
  return { ...actual, hash: hashSpy, verify: verifySpy };
});

const PASSWORD = "correct-horse-battery-staple";
let realHash: string;

async function loadService(userRecord: { id: string; password: string } | null) {
  // Fresh module per test: the decoy hash is memoised at module level.
  vi.resetModules();
  const { AuthService, AuthError } = await import("./service.js");
  const findUnique = vi.fn(async (args: { where: { email?: string; id?: string } }) => {
    if (args.where.email) return userRecord;
    return userRecord ? { id: userRecord.id, email: "ada@example.com" } : null;
  });
  const prisma = { user: { findUnique } } as unknown as PrismaClient;
  return { service: new AuthService(prisma), AuthError, findUnique };
}

beforeEach(async () => {
  hashSpy.mockClear();
  verifySpy.mockClear();
  realHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
  hashSpy.mockClear();
});

describe("AuthService.login — account enumeration resistance (#44)", () => {
  it("runs an argon2 verify for an unknown email, against an argon2id decoy", async () => {
    const { service } = await loadService(null);

    await expect(service.login({ email: "nobody@example.com", password: "whatever-123" })).rejects.toThrow();

    expect(verifySpy).toHaveBeenCalledTimes(1);
    const [hashArg, passwordArg] = verifySpy.mock.calls[0] as [string, string];
    expect(hashArg.startsWith("$argon2id$")).toBe(true);
    expect(passwordArg).toBe("whatever-123");
  });

  it("uses the same argon2 cost parameters as real stored passwords", async () => {
    const { service } = await loadService(null);

    await expect(service.login({ email: "nobody@example.com", password: "x".repeat(12) })).rejects.toThrow();

    const [decoy] = verifySpy.mock.calls[0] as [string];
    const params = (hash: string) => hash.split("$").slice(2, 4).join("$");
    expect(params(decoy)).toBe(params(realHash));
  });

  it("returns an identical error for unknown email and wrong password", async () => {
    const unknown = await loadService(null);
    const known = await loadService({ id: "u1", password: realHash });

    const a = await unknown.service
      .login({ email: "nobody@example.com", password: "wrong-password-1" })
      .catch((e: unknown) => e);
    const b = await known.service
      .login({ email: "ada@example.com", password: "wrong-password-1" })
      .catch((e: unknown) => e);

    expect(a).toBeInstanceOf(unknown.AuthError);
    expect(b).toBeInstanceOf(known.AuthError);
    const pick = (e: unknown) => {
      const err = e as { message: string; code: string; statusCode: number };
      return { message: err.message, code: err.code, statusCode: err.statusCode };
    };
    expect(pick(a)).toEqual(pick(b));
    expect(pick(a)).toEqual({
      message: "Invalid email or password",
      code: "INVALID_CREDENTIALS",
      statusCode: 401,
    });
  });

  it("verifies exactly once on both failure paths", async () => {
    const unknown = await loadService(null);
    await unknown.service.login({ email: "nobody@example.com", password: "wrong-password-1" }).catch(() => undefined);
    const unknownVerifies = verifySpy.mock.calls.length;

    verifySpy.mockClear();
    const known = await loadService({ id: "u1", password: realHash });
    await known.service.login({ email: "ada@example.com", password: "wrong-password-1" }).catch(() => undefined);

    expect(unknownVerifies).toBe(1);
    expect(verifySpy).toHaveBeenCalledTimes(1);
  });

  it("computes the decoy hash once per process, not per failed login", async () => {
    const { service } = await loadService(null);

    for (let i = 0; i < 3; i++) {
      await service.login({ email: `n${i}@example.com`, password: "wrong-password-1" }).catch(() => undefined);
    }

    expect(hashSpy).toHaveBeenCalledTimes(1);
    expect(verifySpy).toHaveBeenCalledTimes(3);
  });

  it("still authenticates a valid user", async () => {
    const { service } = await loadService({ id: "u1", password: realHash });

    const user = await service.login({ email: "ada@example.com", password: PASSWORD });

    expect(user).toMatchObject({ id: "u1" });
    expect(hashSpy).not.toHaveBeenCalled();
  });
});
