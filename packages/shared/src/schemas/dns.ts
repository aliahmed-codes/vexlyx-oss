import { z } from "zod";

// ---------------------------------------------------------------------------
// Constants & Regex
// ---------------------------------------------------------------------------

export const IPV4_REGEX =
  /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])$/;

export const IPV6_REGEX =
  /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

export const FQDN_RECORD_VALUE_REGEX =
  /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\.?$/;

// Valid DNS record name: @ (apex), *, or labels with letters, digits, hyphens, underscores (for SRV/DKIM), and dots
export const DNS_NAME_REGEX = /^(@|\*|(?:\*|\b[a-zA-Z0-9_](?:[a-zA-Z0-9_-]{0,61}[a-zA-Z0-9_])?)(?:\.[a-zA-Z0-9_](?:[a-zA-Z0-9_-]{0,61}[a-zA-Z0-9_])?)*)$/;

// ---------------------------------------------------------------------------
// Enums & Types
// ---------------------------------------------------------------------------

export const DnsRecordTypeSchema = z.enum(["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV"]);
export type DnsRecordType = z.infer<typeof DnsRecordTypeSchema>;

export const DnsRecordNameSchema = z
  .string()
  .min(1, "Name is required")
  .max(253, "Name is too long")
  .trim()
  .refine((val) => DNS_NAME_REGEX.test(val), {
    message: "Record name must be @ (for apex), *, or a valid label (e.g. www, mail, _sip._tcp)",
  });

// ---------------------------------------------------------------------------
// Create DNS Record Schema with strict per-type validation
// ---------------------------------------------------------------------------

export const CreateDnsRecordSchema = z
  .object({
    type: DnsRecordTypeSchema,
    name: DnsRecordNameSchema,
    value: z.string().min(1, "Value is required").trim(),
    ttl: z.coerce.number().int().min(60, "TTL must be at least 60 seconds").max(86400, "TTL cannot exceed 86400 seconds").default(3600),
    priority: z.coerce.number().int().min(0).max(65535).optional().nullable(),
    weight: z.coerce.number().int().min(0).max(65535).optional().nullable(),
    port: z.coerce.number().int().min(1).max(65535).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    // A Record: Must be valid IPv4
    if (data.type === "A") {
      if (!IPV4_REGEX.test(data.value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["value"],
          message: "A record value must be a valid IPv4 address (e.g. 192.0.2.1)",
        });
      }
    }

    // AAAA Record: Must be valid IPv6
    if (data.type === "AAAA") {
      if (!IPV6_REGEX.test(data.value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["value"],
          message: "AAAA record value must be a valid IPv6 address (e.g. 2001:db8::1)",
        });
      }
    }

    // CNAME Record: Must be a target hostname (not IP) and cannot be @ per RFC 1912
    if (data.type === "CNAME") {
      if (data.name === "@") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["name"],
          message: "CNAME records cannot be placed at the zone apex (@) per RFC 1912",
        });
      }
      if (IPV4_REGEX.test(data.value) || IPV6_REGEX.test(data.value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["value"],
          message: "CNAME value must be a target domain name, not an IP address",
        });
      }
    }

    // MX Record: Priority is required (0-65535), value is mail exchange host
    if (data.type === "MX") {
      if (data.priority === undefined || data.priority === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["priority"],
          message: "MX records require a priority value (0–65535)",
        });
      }
      if (IPV4_REGEX.test(data.value) || IPV6_REGEX.test(data.value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["value"],
          message: "MX value must be a mail server hostname, not an IP address",
        });
      }
    }

    // TXT Record: Character limit 2048
    if (data.type === "TXT") {
      if (data.value.length > 2048) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["value"],
          message: "TXT record content cannot exceed 2048 characters",
        });
      }
    }

    // NS Record: Must be a nameserver hostname
    if (data.type === "NS") {
      if (IPV4_REGEX.test(data.value) || IPV6_REGEX.test(data.value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["value"],
          message: "NS value must be a nameserver hostname (e.g. ns1.vexlyx.com), not an IP address",
        });
      }
    }

    // SRV Record: Priority, Weight, Port required
    if (data.type === "SRV") {
      if (data.priority === undefined || data.priority === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["priority"],
          message: "SRV records require a priority (0–65535)",
        });
      }
      if (data.weight === undefined || data.weight === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["weight"],
          message: "SRV records require a weight (0–65535)",
        });
      }
      if (data.port === undefined || data.port === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["port"],
          message: "SRV records require a port (1–65535)",
        });
      }
    }
  });

export type CreateDnsRecordInput = z.infer<typeof CreateDnsRecordSchema>;

// ---------------------------------------------------------------------------
// Update DNS Record Schema
// ---------------------------------------------------------------------------

export const UpdateDnsRecordSchema = z.object({
  name: DnsRecordNameSchema.optional(),
  value: z.string().min(1, "Value cannot be empty").trim().optional(),
  ttl: z.coerce.number().int().min(60).max(86400).optional(),
  priority: z.coerce.number().int().min(0).max(65535).optional().nullable(),
  weight: z.coerce.number().int().min(0).max(65535).optional().nullable(),
  port: z.coerce.number().int().min(1).max(65535).optional().nullable(),
});

export type UpdateDnsRecordInput = z.infer<typeof UpdateDnsRecordSchema>;

// ---------------------------------------------------------------------------
// Import Zone File Schema
// ---------------------------------------------------------------------------

export const ImportZoneFileSchema = z.object({
  zoneContent: z.string().min(1, "Zone file content cannot be empty"),
  strategy: z.enum(["skip", "replace"]).default("skip"),
});

export type ImportZoneFileInput = z.infer<typeof ImportZoneFileSchema>;

// ---------------------------------------------------------------------------
// Response Types
// ---------------------------------------------------------------------------

export interface DnsRecordResponse {
  id: string;
  type: DnsRecordType;
  name: string;
  value: string;
  ttl: number;
  priority: number | null;
  weight: number | null;
  port: number | null;
  domainId: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface DnsResolverCheck {
  resolver: string;
  ip: string;
  status: "MATCH" | "MISMATCH" | "NOT_FOUND" | "ERROR";
  detectedValues: string[];
  latencyMs: number;
  error?: string;
}

export interface DnsPropagationResponse {
  recordId: string;
  recordType: DnsRecordType;
  recordName: string;
  expectedValue: string;
  isFullyPropagated: boolean;
  resolvers: DnsResolverCheck[];
  checkedAt: string;
}

// ---------------------------------------------------------------------------
// RFC 1035 Zone File Generation & Parsing
// ---------------------------------------------------------------------------

export interface GenerateZoneOptions {
  ttl?: number;
  ns1?: string;
  ns2?: string;
  adminEmail?: string;
  serial?: number;
}

/**
 * Zone-file hostnames without a trailing dot are relative to $ORIGIN, so a
 * stored "mail.example.com" would be served as "mail.example.com.example.com.".
 * Record values are always entered as full hostnames, so make them absolute.
 */
function toAbsoluteName(value: string): string {
  const trimmed = value.trim();
  return trimmed === "@" || trimmed.endsWith(".") ? trimmed : `${trimmed}.`;
}

/**
 * Renders a TXT value as one or more quoted <=255-byte strings (the DNS limit
 * per string; 2048-bit DKIM keys exceed it). Any quoting already present in the
 * stored value is stripped first so it isn't doubled.
 */
function toTxtStrings(value: string): string {
  let text = value.trim();
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    text = text.slice(1, -1);
  }
  const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  // Split on escape-sequence boundaries so a chunk never ends mid-escape
  const chunks = escaped.match(/(?:\\.|[^\\]){1,255}/g) ?? [""];
  return chunks.map((chunk) => `"${chunk}"`).join(" ");
}

/**
 * Generates standard RFC 1035 DNS Zone text compatible with CoreDNS, BIND9, Route53, and Cloudflare.
 */
export function generateZoneFile(
  hostname: string,
  records: Array<{
    type: string;
    name: string;
    value: string;
    ttl: number;
    priority?: number | null;
    weight?: number | null;
    port?: number | null;
  }>,
  options: GenerateZoneOptions = {},
): string {
  const domain = hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
  const origin = `${domain}.`;
  const defaultTtl = options.ttl ?? 3600;
  // If the zone carries its own apex NS records they are the nameserver set;
  // the SOA primary follows the first one instead of a hard-coded default.
  const apexNsRecords = records.filter(
    (r) => r.type.toUpperCase() === "NS" && (r.name.trim() || "@") === "@",
  );
  const hasOwnNs = apexNsRecords.length > 0;
  const ns1 = hasOwnNs
    ? toAbsoluteName(apexNsRecords[0]!.value)
    : (options.ns1 ?? `ns1.vexlyx.com.`);
  const ns2 = options.ns2 ?? `ns2.vexlyx.com.`;
  const adminEmail = (options.adminEmail ?? `hostmaster.${domain}`).replace(/@/g, ".");
  // CoreDNS reloads a zone only when its SOA serial changes. A date-based serial
  // stays the same all day, so edits made after the first load were never served;
  // epoch seconds change on every write (and fit the 32-bit serial until 2106).
  const serial = options.serial ?? Math.floor(Date.now() / 1000);

  const lines: string[] = [
    `; Zone file for ${domain}`,
    `; Exported from Vexlyx Control Panel on ${new Date().toISOString()}`,
    `$ORIGIN ${origin}`,
    `$TTL ${defaultTtl}`,
    "",
    `; SOA Record`,
    `@   IN  SOA ${ns1} ${adminEmail.endsWith(".") ? adminEmail : adminEmail + "."} (`,
    `            ${serial} ; Serial`,
    `            7200       ; Refresh (2h)`,
    `            3600       ; Retry (1h)`,
    `            1209600    ; Expire (2w)`,
    `            3600 )     ; Minimum TTL (1h)`,
    "",
    ...(hasOwnNs
      ? []
      : [`; Nameservers`, `@       IN  NS      ${ns1}`, `@       IN  NS      ${ns2}`, ""]),
    `; User DNS Records`,
  ];

  for (const record of records) {
    const recName = record.name.trim() || "@";
    const paddedName = recName.padEnd(20, " ");
    const ttlStr = (record.ttl || defaultTtl).toString().padEnd(8, " ");
    const type = record.type.toUpperCase();

    if (type === "MX") {
      const prio = record.priority ?? 10;
      lines.push(`${paddedName} ${ttlStr} IN  MX    ${prio} ${toAbsoluteName(record.value)}`);
    } else if (type === "SRV") {
      const prio = record.priority ?? 0;
      const weight = record.weight ?? 0;
      const port = record.port ?? 0;
      lines.push(
        `${paddedName} ${ttlStr} IN  SRV   ${prio} ${weight} ${port} ${toAbsoluteName(record.value)}`,
      );
    } else if (type === "TXT") {
      lines.push(`${paddedName} ${ttlStr} IN  TXT   ${toTxtStrings(record.value)}`);
    } else if (type === "CNAME" || type === "NS") {
      lines.push(`${paddedName} ${ttlStr} IN  ${type.padEnd(6, " ")} ${toAbsoluteName(record.value)}`);
    } else {
      lines.push(`${paddedName} ${ttlStr} IN  ${type.padEnd(6, " ")} ${record.value}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

export interface ParsedDnsRecord {
  type: DnsRecordType;
  name: string;
  value: string;
  ttl: number;
  priority?: number | null;
  weight?: number | null;
  port?: number | null;
}

/**
 * Parses standard RFC 1035 zone file content into structured records.
 * Supports $ORIGIN, $TTL, multiline entries, comments (;), and standard record formats.
 */
export function parseZoneFile(
  zoneContent: string,
  defaultOrigin?: string,
): {
  origin?: string;
  ttl?: number;
  records: ParsedDnsRecord[];
  errors: string[];
} {
  const records: ParsedDnsRecord[] = [];
  const errors: string[] = [];

  let currentOrigin = defaultOrigin ? (defaultOrigin.endsWith(".") ? defaultOrigin : `${defaultOrigin}.`) : undefined;
  let currentTtl = 3600;

  // Flatten multiline parentheses (e.g. multi-line SOA records)
  const flattened = zoneContent.replace(/\([\s\S]*?\)/g, (match) => {
    return match.replace(/\r?\n/g, " ").replace(/[()]/g, "");
  });

  const lines = flattened.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine) continue;
    // Remove comments
    const lineWithoutComment = rawLine.replace(/;.*$/, "").trim();
    if (!lineWithoutComment) continue;

    // Handle $ORIGIN
    if (lineWithoutComment.toUpperCase().startsWith("$ORIGIN")) {
      const parts = lineWithoutComment.split(/\s+/);
      const originPart = parts[1];
      if (originPart) {
        currentOrigin = originPart.trim();
      }
      continue;
    }

    // Handle $TTL
    if (lineWithoutComment.toUpperCase().startsWith("$TTL")) {
      const parts = lineWithoutComment.split(/\s+/);
      const ttlPart = parts[1];
      if (ttlPart) {
        const parsedTtl = parseInt(ttlPart, 10);
        if (!isNaN(parsedTtl)) {
          currentTtl = parsedTtl;
        }
      }
      continue;
    }

    // Split tokens by whitespace
    const tokens = lineWithoutComment.split(/\s+/);
    if (tokens.length < 3) continue;

    // Standard format: [name] [ttl] [class] <type> <rdata...>
    let name = "@";
    let ttl = currentTtl;
    let typeIdx = -1;

    // Find known type
    const knownTypes = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "SOA"];
    for (let t = 0; t < tokens.length; t++) {
      const token = tokens[t];
      if (token && knownTypes.includes(token.toUpperCase())) {
        typeIdx = t;
        break;
      }
    }

    if (typeIdx === -1) {
      continue; // Skip unrecognized lines
    }

    const recTypeToken = tokens[typeIdx];
    if (!recTypeToken) continue;
    const recType = recTypeToken.toUpperCase();
    if (recType === "SOA") {
      continue; // Skip SOA record during record import
    }

    // Tokens before typeIdx contain name, optional TTL, optional class (IN)
    const prefixTokens = tokens.slice(0, typeIdx);
    if (prefixTokens.length > 0) {
      const firstPrefix = prefixTokens[0];
      if (!firstPrefix || !isNaN(parseInt(firstPrefix, 10)) || firstPrefix.toUpperCase() === "IN") {
        name = "@";
      } else {
        name = firstPrefix;
      }

      for (const pt of prefixTokens) {
        if (!pt) continue;
        const val = parseInt(pt, 10);
        if (!isNaN(val) && val > 0) {
          ttl = val;
        }
      }
    }

    const rdataTokens = tokens.slice(typeIdx + 1);
    if (rdataTokens.length === 0) continue;

    try {
      if (recType === "A" || recType === "AAAA" || recType === "CNAME" || recType === "NS") {
        const firstRdata = rdataTokens[0];
        if (!firstRdata) continue;
        const value = firstRdata.replace(/\.$/, "");
        records.push({
          type: recType as DnsRecordType,
          name: cleanZoneName(name, currentOrigin),
          value,
          ttl,
        });
      } else if (recType === "MX") {
        const firstRdata = rdataTokens[0];
        if (!firstRdata) continue;
        const priority = parseInt(firstRdata, 10);
        const value = rdataTokens.slice(1).join(" ").replace(/\.$/, "");
        if (!isNaN(priority) && value) {
          records.push({
            type: "MX",
            name: cleanZoneName(name, currentOrigin),
            value,
            ttl,
            priority,
          });
        }
      } else if (recType === "TXT") {
        let text = rdataTokens.join(" ");
        if (text.startsWith('"') && text.endsWith('"')) {
          text = text.slice(1, -1);
        }
        text = text.replace(/\\"/g, '"');
        records.push({
          type: "TXT",
          name: cleanZoneName(name, currentOrigin),
          value: text,
          ttl,
        });
      } else if (recType === "SRV") {
        if (rdataTokens.length >= 4) {
          const prioToken = rdataTokens[0];
          const weightToken = rdataTokens[1];
          const portToken = rdataTokens[2];
          if (!prioToken || !weightToken || !portToken) continue;
          const priority = parseInt(prioToken, 10);
          const weight = parseInt(weightToken, 10);
          const port = parseInt(portToken, 10);
          const value = rdataTokens.slice(3).join(" ").replace(/\.$/, "");
          records.push({
            type: "SRV",
            name: cleanZoneName(name, currentOrigin),
            value,
            ttl,
            priority: isNaN(priority) ? null : priority,
            weight: isNaN(weight) ? null : weight,
            port: isNaN(port) ? null : port,
          });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Line ${i + 1}: ${msg}`);
    }
  }

  return { origin: currentOrigin, ttl: currentTtl, records, errors };
}

function cleanZoneName(name: string, origin?: string): string {
  let cleaned = name.trim();
  if (cleaned === "@") return "@";
  if (origin && cleaned.endsWith(origin)) {
    cleaned = cleaned.slice(0, -origin.length).replace(/\.$/, "");
    if (!cleaned) return "@";
  }
  return cleaned.replace(/\.$/, "");
}
