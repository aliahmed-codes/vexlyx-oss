import { env } from "../../config/env.js";

export const PUBLIC_RESOLVER_IPS = ["1.1.1.1", "8.8.8.8", "9.9.9.9"];

/** The address this server's records should point at (installer sets PUBLIC_IP; SERVER_IP is the legacy name). */
export function getServerIp(): string {
  return env.PUBLIC_IP || process.env.SERVER_IP || "127.0.0.1";
}
