import type { Server as SocketIOServer } from "socket.io";
import type { FastifyBaseLogger } from "fastify";
import { ServicesService } from "./service.js";
import {
  authorizeSocketSubscription,
  type SocketAccessRule,
  type SocketAuthorizer,
} from "../../plugins/socket-auth.js";

// ---------------------------------------------------------------------------
// Track active status push intervals keyed by socket ID
// ---------------------------------------------------------------------------

const activeIntervals = new Map<string, ReturnType<typeof setInterval>>();

// ---------------------------------------------------------------------------
// Push a single status snapshot to the services room
// ---------------------------------------------------------------------------

async function pushStatus(io: SocketIOServer, service: ServicesService, logger: FastifyBaseLogger): Promise<void> {
  try {
    const status = await service.getStatus();
    io.to("services").emit("services:status", status);
  } catch (err) {
    logger.error({ err }, "Failed to collect service status for Socket.io push");
  }
}

// ---------------------------------------------------------------------------
// Start per-socket status push interval (10-second cadence — cheaper than
// full server metrics, so no need to match monitoring's 5s cadence)
// ---------------------------------------------------------------------------

function startStatusPush(socketId: string, io: SocketIOServer, service: ServicesService, logger: FastifyBaseLogger): void {
  if (activeIntervals.has(socketId)) return;

  const interval = setInterval(() => {
    void pushStatus(io, service, logger);
  }, 10_000);

  activeIntervals.set(socketId, interval);
}

function stopStatusPush(socketId: string): void {
  const interval = activeIntervals.get(socketId);
  if (interval) {
    clearInterval(interval);
    activeIntervals.delete(socketId);
  }
}

// ---------------------------------------------------------------------------
// Register socket event handlers
// ---------------------------------------------------------------------------

/** Same rule as `GET /api/services`: `requireRole("ADMIN")`. */
export const SERVICES_ROOM_ACCESS: SocketAccessRule = { roles: ["ADMIN"] };

export function registerServicesSocketHandlers(
  io: SocketIOServer,
  service: ServicesService,
  logger: FastifyBaseLogger,
  authorize: SocketAuthorizer,
): void {
  io.on("connection", (socket) => {
    // --- Subscribe to live service status (ADMIN only, like the HTTP route) ---
    socket.on("subscribe:services", async () => {
      const allowed = await authorizeSocketSubscription(
        authorize,
        socket,
        SERVICES_ROOM_ACCESS,
        "services:forbidden",
      );
      if (!allowed) return;

      await socket.join("services");

      // Send an immediate snapshot on join so the client doesn't wait 10s
      try {
        const status = await service.getStatus();
        socket.emit("services:status", status);
      } catch (err) {
        logger.error({ socketId: socket.id, err }, "Initial service status push failed");
      }

      startStatusPush(socket.id, io, service, logger);
      logger.debug({ socketId: socket.id }, "Subscribed to services");
    });

    // --- Unsubscribe from live service status ---
    socket.on("unsubscribe:services", async () => {
      stopStatusPush(socket.id);
      await socket.leave("services");
      logger.debug({ socketId: socket.id }, "Unsubscribed from services");
    });

    // --- Cleanup on disconnect ---
    socket.on("disconnect", () => {
      stopStatusPush(socket.id);
    });
  });
}
