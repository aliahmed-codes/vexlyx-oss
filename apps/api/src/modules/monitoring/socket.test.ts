import { describe, it, expect, vi } from "vitest";
import type { Server as SocketIOServer } from "socket.io";
import type { FastifyBaseLogger } from "fastify";
import type { MonitoringService } from "./service.js";
import { registerMonitoringSocketHandlers } from "./socket.js";

type Handler = () => Promise<void>;

function setup(isAdmin: (userId: string) => Promise<boolean>, userId?: string) {
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
  } as unknown as SocketIOServer;
  const service = {
    getServerMetrics: vi.fn(async () => ({ cpuPercent: 1 })),
    getContainerMetrics: vi.fn(async () => []),
  } as unknown as MonitoringService;
  const logger = { error: vi.fn(), debug: vi.fn() } as unknown as FastifyBaseLogger;

  registerMonitoringSocketHandlers(io, service, logger, isAdmin);
  onConnection(socket);
  return { socket, service, handlers };
}

describe("subscribe:metrics authorization", () => {
  it("lets an admin join the room and receive an initial snapshot", async () => {
    const { socket, handlers } = setup(async () => true, "u1");
    await handlers.get("subscribe:metrics")!();

    expect(socket.join).toHaveBeenCalledWith("metrics");
    expect(socket.emit).toHaveBeenCalledWith("metrics:server", { cpuPercent: 1 });
    // Stops the per-socket push interval started by the handler.
    await handlers.get("unsubscribe:metrics")!();
  });

  it("denies a non-admin: no room join, no metrics, explicit forbidden event", async () => {
    const { socket, service, handlers } = setup(async () => false, "u1");
    await handlers.get("subscribe:metrics")!();

    expect(socket.join).not.toHaveBeenCalled();
    expect(service.getServerMetrics).not.toHaveBeenCalled();
    expect(service.getContainerMetrics).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(
      "metrics:forbidden",
      expect.objectContaining({ code: "FORBIDDEN_ROLE" }),
    );
  });

  it("fails closed when the role lookup throws", async () => {
    const { socket, service, handlers } = setup(async () => {
      throw new Error("db down");
    }, "u1");
    await handlers.get("subscribe:metrics")!();

    expect(socket.join).not.toHaveBeenCalled();
    expect(service.getServerMetrics).not.toHaveBeenCalled();
  });

  it("denies a socket with no resolved identity without querying roles", async () => {
    const isAdmin = vi.fn(async () => true);
    const { socket, handlers } = setup(isAdmin);
    await handlers.get("subscribe:metrics")!();

    expect(isAdmin).not.toHaveBeenCalled();
    expect(socket.join).not.toHaveBeenCalled();
  });
});
