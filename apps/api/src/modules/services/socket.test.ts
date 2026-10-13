import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { FastifyBaseLogger } from "fastify";
import type { Server as SocketIOServer } from "socket.io";
import { createSocketAuthorizer } from "../../plugins/socket-auth.js";
import type { ServicesService } from "./service.js";

// config/env.ts validates process.env at import time
process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/vexlyx_test";
process.env.SESSION_SECRET ??= "test-session-secret-at-least-32-characters-long";
const { SERVICES_ROOM_ACCESS, registerServicesSocketHandlers } = await import("./socket.js");

type Handler = () => Promise<void>;

function connect(
  user: { role: string; permissions: string[] } | null,
  userId?: string,
) {
  const handlers = new Map<string, Handler>();
  const socket = {
    id: "sock-1",
    data: { userId },
    join: vi.fn(async () => undefined),
    leave: vi.fn(async () => undefined),
    emit: vi.fn(),
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, handler);
    }),
  };
  let onConnection: (s: typeof socket) => void = () => undefined;
  const io = {
    on: vi.fn((_event: string, cb: typeof onConnection) => {
      onConnection = cb;
    }),
    to: vi.fn().mockReturnValue({ emit: vi.fn() }),
  } as unknown as SocketIOServer;
  const service = {
    getStatus: vi.fn().mockResolvedValue({ services: [] }),
  } as unknown as ServicesService;
  const logger = { debug: vi.fn(), error: vi.fn() } as unknown as FastifyBaseLogger;
  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue(user) },
  } as unknown as PrismaClient;

  registerServicesSocketHandlers(io, service, logger, createSocketAuthorizer(prisma, logger));
  onConnection(socket);
  return { socket, service, handlers };
}

describe("subscribe:services authorization (#65)", () => {
  it("matches the HTTP guard: ADMIN only", () => {
    expect(SERVICES_ROOM_ACCESS).toEqual({ roles: ["ADMIN"] });
  });

  it("lets an admin join and receive an initial snapshot", async () => {
    const { socket, handlers } = connect({ role: "ADMIN", permissions: [] }, "u1");

    await handlers.get("subscribe:services")!();

    expect(socket.join).toHaveBeenCalledWith("services");
    expect(socket.emit).toHaveBeenCalledWith("services:status", { services: [] });
    // Stops the push interval the handler started.
    await handlers.get("unsubscribe:services")!();
  });

  it.each(["USER", "RESELLER"])(
    "denies a %s: no join, no status collected, forbidden event sent",
    async (role) => {
      const { socket, service, handlers } = connect({ role, permissions: ["canManageBackups"] }, "u1");

      await handlers.get("subscribe:services")!();

      expect(socket.join).not.toHaveBeenCalled();
      expect(service.getStatus).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith(
        "services:forbidden",
        expect.objectContaining({ code: "FORBIDDEN_ROLE" }),
      );
    },
  );

  it("denies a socket with no resolved identity", async () => {
    const { socket, service, handlers } = connect({ role: "ADMIN", permissions: [] }, undefined);

    await handlers.get("subscribe:services")!();

    expect(socket.join).not.toHaveBeenCalled();
    expect(service.getStatus).not.toHaveBeenCalled();
  });
});
