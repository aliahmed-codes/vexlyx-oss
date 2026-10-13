import type { Server as SocketIOServer } from "socket.io";
import type { FastifyBaseLogger } from "fastify";
import {
  authorizeSocketSubscription,
  type SocketAccessRule,
  type SocketAuthorizer,
} from "../../plugins/socket-auth.js";

/** Same rule as every backups HTTP route: `requireRoleOrPermission(["ADMIN"], "canManageBackups")`. */
export const BACKUPS_ROOM_ACCESS: SocketAccessRule = {
  roles: ["ADMIN"],
  permission: "canManageBackups",
};

/**
 * Registers subscribe/unsubscribe handlers for the "backups" room, used to
 * push live backup:progress / backup:completed / restore:progress /
 * restore:completed events (emitted directly by BackupService). The room
 * carries snapshot/item IDs and error messages for every snapshot, so joining
 * it is held to the same guard as the HTTP API (#65).
 */
export function registerBackupSocketHandlers(
  io: SocketIOServer,
  logger: FastifyBaseLogger,
  authorize: SocketAuthorizer,
): void {
  io.on("connection", (socket) => {
    socket.on("subscribe:backups", async () => {
      const allowed = await authorizeSocketSubscription(
        authorize,
        socket,
        BACKUPS_ROOM_ACCESS,
        "backups:forbidden",
      );
      if (!allowed) return;

      await socket.join("backups");
      logger.debug({ socketId: socket.id }, "Subscribed to backups");
    });

    socket.on("unsubscribe:backups", async () => {
      await socket.leave("backups");
      logger.debug({ socketId: socket.id }, "Unsubscribed from backups");
    });
  });
}
