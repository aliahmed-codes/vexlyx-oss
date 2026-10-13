import type { ChildProcess } from "node:child_process";

/**
 * Backstop limits (ms) for the system/python/*.py scripts the API spawns.
 *
 * The Python managers enforce their own, tighter limits on the commands they
 * run (killing the real grandchild: docker, nixpacks, git, ...). These sit just
 * above those so the API never waits forever on a wedged script, and never
 * fires before the script has had the chance to report its own timeout.
 */
export const PYTHON_SCRIPT_TIMEOUT_MS = {
  /** nixpacks plan / static output extraction / dockerfile read-write. */
  quick: 180_000,
  /** One-shot status / inspect style commands. */
  status: 90_000,
  /** One-shot `compose logs`. */
  logs: 120_000,
  /** docker build / nixpacks build. */
  build: 3_660_000,
  /** docker compose up / start / stop / restart / down. */
  compose: 1_860_000,
  /** git clone / fetch of a large repository. */
  git: 960_000,
  /** Database create / drop / test. */
  database: 180_000,
  /** SFTP user provisioning. */
  sftp: 300_000,
  /** WordPress install / import / export (may stream a database dump). */
  wordpress: 1_860_000,
} as const;

/**
 * Kills `child` and calls `onTimeout` if it is still running after `timeoutMs`.
 * The timer clears itself when the process closes or fails to spawn.
 *
 * `onTimeout` runs before the kill so the caller's promise is settled with a
 * timeout error first; the `close` handler that follows the kill then finds an
 * already-settled promise and is a no-op.
 */
export function watchChildTimeout(
  child: ChildProcess,
  timeoutMs: number,
  onTimeout: (timeoutMs: number) => void,
): void {
  const timer = setTimeout(() => {
    onTimeout(timeoutMs);
    child.kill("SIGKILL");
  }, timeoutMs);

  const clear = () => clearTimeout(timer);
  child.once("close", clear);
  child.once("error", clear);
}
