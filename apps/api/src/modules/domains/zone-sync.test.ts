import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

// config/env.ts validates process.env at import time
process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/vexlyx_test";
process.env.SESSION_SECRET ??= "test-session-secret-at-least-32-characters-long";

const { DnsService, checkDnsZonesDirWritable } = await import("./dns-service.js");
const { DomainError } = await import("./service.js");

afterEach(() => vi.restoreAllMocks());

function logger() {
  return { error: vi.fn(), warn: vi.fn() };
}

function prismaFixture(dnsMode: "MANAGED" | "CONNECTED" = "MANAGED") {
  return {
    domain: {
      findUnique: vi.fn().mockResolvedValue({ dnsMode }),
      findFirst: vi.fn().mockResolvedValue({ id: "d1", hostname: "example.com", dnsMode }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    dnsRecord: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({ id: "r1", domainId: "d1" }),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  };
}

function writeFailsWith(code: string) {
  return vi.spyOn(fs, "writeFileSync").mockImplementation(() => {
    throw Object.assign(new Error(`${code}: permission denied`), { code });
  });
}

describe("DnsService.syncZoneFile (#50)", () => {
  it("writes the zone file for a managed domain", async () => {
    const write = vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);
    const service = new DnsService(prismaFixture() as unknown as PrismaClient, logger());

    await expect(service.syncZoneFile("example.com", "d1")).resolves.toBeUndefined();

    expect(write).toHaveBeenCalledTimes(1);
    expect(String(write.mock.calls[0]![0])).toMatch(/example\.com\.db$/);
  });

  it("does nothing for a connect-only domain", async () => {
    const write = vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);
    const service = new DnsService(prismaFixture("CONNECTED") as unknown as PrismaClient, logger());

    await expect(service.syncZoneFile("example.com", "d1")).resolves.toBeUndefined();

    expect(write).not.toHaveBeenCalled();
  });

  it("throws DNS_ZONE_WRITE_FAILED and logs the domain and path when the write fails", async () => {
    writeFailsWith("EACCES");
    const log = logger();
    const service = new DnsService(prismaFixture() as unknown as PrismaClient, log);

    const err = await service.syncZoneFile("example.com", "d1").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(DomainError);
    expect(err).toMatchObject({ code: "DNS_ZONE_WRITE_FAILED", statusCode: 500 });
    expect((err as Error).message).toContain("example.com");
    expect((err as Error).message).toContain("EACCES");
    // The filesystem path is for operators (logs), not for API clients.
    expect((err as Error).message).not.toMatch(/[\\/]/);
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: "example.com",
        zoneFilePath: expect.stringMatching(/example\.com\.db$/),
      }),
      "Failed to write DNS zone file",
    );
  });

  it("surfaces the failure through a record mutation instead of reporting success", async () => {
    writeFailsWith("ENOSPC");
    const prisma = prismaFixture();
    const service = new DnsService(prisma as unknown as PrismaClient, logger());

    await expect(service.deleteRecord("u1", "d1", "r1")).rejects.toMatchObject({
      code: "DNS_ZONE_WRITE_FAILED",
    });
    // The database change itself was committed before the zone write.
    expect(prisma.dnsRecord.delete).toHaveBeenCalledTimes(1);
  });
});

describe("DnsService.syncAllManagedZones (#50)", () => {
  it("returns the number of zones written", async () => {
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);
    const prisma = prismaFixture();
    prisma.domain.findMany.mockResolvedValue([
      { id: "d1", hostname: "a.example" },
      { id: "d2", hostname: "b.example" },
    ]);
    const service = new DnsService(prisma as unknown as PrismaClient, logger());

    await expect(service.syncAllManagedZones()).resolves.toBe(2);
  });

  it("keeps writing the other zones when one fails, then reports the failure", async () => {
    const write = vi.spyOn(fs, "writeFileSync").mockImplementation((file) => {
      if (String(file).endsWith("broken.example.db")) {
        throw Object.assign(new Error("EIO"), { code: "EIO" });
      }
    });
    const prisma = prismaFixture();
    prisma.domain.findMany.mockResolvedValue([
      { id: "d1", hostname: "broken.example" },
      { id: "d2", hostname: "fine.example" },
    ]);
    const log = logger();
    const service = new DnsService(prisma as unknown as PrismaClient, log);

    const err = await service.syncAllManagedZones().catch((e: unknown) => e);

    expect(err).toMatchObject({ code: "DNS_ZONE_WRITE_FAILED" });
    expect((err as Error).message).toContain("1 of 2");
    expect((err as Error).message).toContain("broken.example");
    expect(write).toHaveBeenCalledTimes(2);
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: "broken.example" }),
      "Failed to sync hosted DNS zone",
    );
  });
});

describe("checkDnsZonesDirWritable (#50)", () => {
  it("reports ok when the directory is writable", () => {
    vi.spyOn(fs, "accessSync").mockImplementation(() => undefined);

    expect(checkDnsZonesDirWritable()).toMatchObject({ ok: true });
  });

  it("reports the directory and reason when it is not writable", () => {
    vi.spyOn(fs, "accessSync").mockImplementation(() => {
      throw new Error("EACCES: permission denied");
    });

    const result = checkDnsZonesDirWritable();

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("EACCES") });
    expect(result.path).toMatch(/zones$/);
  });
});
