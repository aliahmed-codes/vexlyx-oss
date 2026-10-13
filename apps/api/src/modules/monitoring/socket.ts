import type { Server as SocketIOServer } from "socket.io";
import type { FastifyBaseLogger } from "fastify";
import { MonitoringService } from "./service.js";
import type { ServerMetrics, ThresholdConfig } from "@vexlyx/shared";

// ---------------------------------------------------------------------------
// Default alert thresholds (can be made configurable via env later)
// ---------------------------------------------------------------------------

const DEFAULT_THRESHOLDS: ThresholdConfig = {
  cpuThreshold: 80,
  ramThreshold: 85,
  diskThreshold: 90,
};

// ---------------------------------------------------------------------------
// Track active metric push intervals keyed by socket ID
// ---------------------------------------------------------------------------

const activeIntervals = new Map<string, ReturnType<typeof setInterval>>();

// ---------------------------------------------------------------------------
// Threshold alert state & cooldown tracking
// Prevents spamming alerts every 5 seconds when a metric stays above threshold.
// Alerts fire once upon crossing the threshold, with a 5-minute cooldown
// before any repeat notification, and reset once the metric drops below limit.
// ---------------------------------------------------------------------------

const ALERT_COOLDOWN_MS = 5 * 60_000; // 5 minutes
const lastAlertTimes = new Map<string, number>();
const activeBreaches = new Set<string>();

function checkThresholds(
  io: SocketIOServer,
  metrics: ServerMetrics,
  thresholds: ThresholdConfig,
): void {
  const now = Date.now();
  const timestamp = new Date(now).toISOString();

  const checks: Array<{
    type: "cpu" | "ram" | "disk";
    value: number;
    threshold: number;
    name: string;
  }> = [
    { type: "cpu", value: metrics.cpuPercent, threshold: thresholds.cpuThreshold, name: "CPU" },
    { type: "ram", value: metrics.ramPercent, threshold: thresholds.ramThreshold, name: "RAM" },
    { type: "disk", value: metrics.diskPercent, threshold: thresholds.diskThreshold, name: "Disk" },
  ];

  for (const { type, value, threshold, name } of checks) {
    if (value > threshold) {
      const lastAlert = lastAlertTimes.get(type) ?? 0;
      const wasActive = activeBreaches.has(type);

      // Alert if this is a new breach OR if cooldown has expired
      if (!wasActive || now - lastAlert >= ALERT_COOLDOWN_MS) {
        lastAlertTimes.set(type, now);
        activeBreaches.add(type);

        io.to("metrics").emit("alert:threshold", {
          type,
          value,
          threshold,
          message: `${name} usage is ${value.toFixed(1)}% (threshold: ${threshold}%)`,
          triggeredAt: timestamp,
        });
      }
    } else {
      // Metric recovered below threshold — reset active breach state
      activeBreaches.delete(type);
    }
  }
}

// ---------------------------------------------------------------------------
// Push a single metrics snapshot to the metrics room
// ---------------------------------------------------------------------------

async function pushMetrics(
  io: SocketIOServer,
  service: MonitoringService,
  logger: FastifyBaseLogger,
  checkAlerts = true,
): Promise<ServerMetrics | null> {
  try {
    const [server, containers] = await Promise.all([
      service.getServerMetrics(),
      service.getContainerMetrics(),
    ]);

    io.to("metrics").emit("metrics:server", server);
    io.to("metrics").emit("metrics:containers", containers);

    if (checkAlerts) {
      checkThresholds(io, server, DEFAULT_THRESHOLDS);
    }

    return server;
  } catch (err) {
    logger.error({ err }, "Failed to collect metrics for Socket.io push");
    return null;
  }
}

// ---------------------------------------------------------------------------
// Start per-socket metrics push interval (5-second cadence)
// ---------------------------------------------------------------------------

function startMetricsPush(
  socketId: string,
  io: SocketIOServer,
  service: MonitoringService,
  logger: FastifyBaseLogger,
): void {
  if (activeIntervals.has(socketId)) return;

  const interval = setInterval(() => {
    void pushMetrics(io, service, logger);
  }, 5_000);

  activeIntervals.set(socketId, interval);
}

function stopMetricsPush(socketId: string): void {
  const interval = activeIntervals.get(socketId);
  if (interval) {
    clearInterval(interval);
    activeIntervals.delete(socketId);
  }
}

// ---------------------------------------------------------------------------
// Register socket event handlers
// ---------------------------------------------------------------------------

export function registerMonitoringSocketHandlers(
  io: SocketIOServer,
  service: MonitoringService,
  logger: FastifyBaseLogger,
  isAdmin: (userId: string) => Promise<boolean>,
): void {
  io.on("connection", (socket) => {
    // --- Subscribe to live metrics (ADMIN only — mirrors the REST routes) ---
    socket.on("subscribe:metrics", async () => {
      // Fail closed: any lookup error or missing identity denies the join.
      const userId = socket.data.userId as string | undefined;
      let allowed = false;
      try {
        allowed = userId ? await isAdmin(userId) : false;
      } catch (err) {
        logger.error({ socketId: socket.id, err }, "Metrics subscribe role check failed");
      }
      if (!allowed) {
        socket.emit("metrics:forbidden", {
          error: "You do not have permission to perform this action",
          code: "FORBIDDEN_ROLE",
          details: {},
        });
        return;
      }

      await socket.join("metrics");

      // Send an immediate snapshot on join so the client doesn't wait 5s
      try {
        const [server, containers] = await Promise.all([
          service.getServerMetrics(),
          service.getContainerMetrics(),
        ]);
        socket.emit("metrics:server", server);
        socket.emit("metrics:containers", containers);
      } catch (err) {
        logger.error({ socketId: socket.id, err }, "Initial metrics push failed");
      }

      startMetricsPush(socket.id, io, service, logger);
      logger.debug({ socketId: socket.id }, "Subscribed to metrics");
    });

    // --- Unsubscribe from live metrics ---
    socket.on("unsubscribe:metrics", async () => {
      stopMetricsPush(socket.id);
      await socket.leave("metrics");
      logger.debug({ socketId: socket.id }, "Unsubscribed from metrics");
    });

    // --- Cleanup on disconnect ---
    socket.on("disconnect", () => {
      stopMetricsPush(socket.id);
    });
  });
}

// ---------------------------------------------------------------------------
// Background collector — called by BullMQ repeatable job every 60 seconds
// Saves a DB snapshot AND pushes live update to all subscribed sockets.
// ---------------------------------------------------------------------------

export async function runMetricsCollectorJob(
  io: SocketIOServer,
  service: MonitoringService,
  logger: FastifyBaseLogger,
): Promise<void> {
  const server = await pushMetrics(io, service, logger, true);

  if (server) {
    try {
      await service.saveSnapshot(server);
    } catch (err) {
      logger.error({ err }, "Failed to persist metric snapshot");
    }

    try {
      // Prune >30d old snapshots once per collection cycle
      await service.pruneOldSnapshots();
    } catch (err) {
      logger.error({ err }, "Failed to prune old metric snapshots");
    }
  }
}
