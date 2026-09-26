import { describe, it, expect, vi } from "vitest";
import { authenticator } from "otplib";

// config/env.ts validates process.env eagerly at import time, so these must
// be set before two-factor-service.ts (which imports encryption.ts → env.ts)
// is loaded — static imports would be hoisted ahead of any assignment here.
process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/vexlyx_test";
process.env.SESSION_SECRET ??= "test-session-secret-at-least-32-characters-long";

const { TwoFactorService } = await import("./two-factor-service.js");
const { encrypt } = await import("../../utils/encryption.js");

function makeService() {
  const store = new Map<string, string>();
  const redis = {
    set: vi.fn(async (k: string, v: string, _mode?: string, _ttl?: number) => {
      store.set(k, v);
      return "OK";
    }),
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    del: vi.fn(async (k: string) => {
      store.delete(k);
    }),
  };
  const prisma = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    recoveryCode: { createMany: vi.fn(), findMany: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  };
  const auditLog = { log: vi.fn(async () => undefined) };
  const service = new TwoFactorService(prisma as never, redis as never, auditLog as never);
  return { service, prisma, redis, auditLog };
}

describe("TwoFactorService.confirmSetup", () => {
  it("enables 2fa on valid totp code and returns 10 recovery codes", async () => {
    const { service, prisma } = makeService();
    const secret = authenticator.generateSecret();
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "u1", email: "u1@example.com", password: "hashed", totpSecretEncrypted: encrypt(secret), totpEnabled: false,
    });
    const code = authenticator.generate(secret);
    const result = await service.confirmSetup("u1", code);
    expect(result.recoveryCodes).toHaveLength(10);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u1" } }),
    );
    expect(prisma.recoveryCode.createMany).toHaveBeenCalledOnce();
    const rows = (prisma.recoveryCode.createMany as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].data as { userId: string; codeHash: string }[];
    expect(rows).toHaveLength(10);
    for (const row of rows) {
      expect(row.userId).toBe("u1");
      expect(row.codeHash).not.toContain(result.recoveryCodes[0]);
    }
  });
});

describe("TwoFactorService.verifyLoginCode", () => {
  it("accepts a valid totp code", async () => {
    const { service, prisma } = makeService();
    const secret = authenticator.generateSecret();
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "u1", totpSecretEncrypted: encrypt(secret), totpEnabled: true,
    });
    const ok = await service.verifyLoginCode("u1", authenticator.generate(secret));
    expect(ok).toBe(true);
  });

  it("rejects a wrong code with no recovery codes", async () => {
    const { service, prisma } = makeService();
    const secret = authenticator.generateSecret();
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "u1", totpSecretEncrypted: encrypt(secret), totpEnabled: true,
    });
    (prisma.recoveryCode.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const ok = await service.verifyLoginCode("u1", "000000");
    expect(ok).toBe(false);
  });
});

describe("TwoFactorService challenge store", () => {
  it("round-trips a challenge token single-use", async () => {
    const { service } = makeService();
    const token = await service.storeChallenge("u1");
    expect(token).toHaveLength(64);
    expect(await service.consumeChallenge(token)).toBe("u1");
    expect(await service.consumeChallenge(token)).toBeNull();
  });
});
