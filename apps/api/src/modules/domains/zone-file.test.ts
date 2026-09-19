import { describe, it, expect, vi, afterEach } from "vitest";
import { generateZoneFile, parseZoneFile } from "@vexlyx/shared";

const record = (type: string, name: string, value: string, extra: Record<string, unknown> = {}) => ({
  type,
  name,
  value,
  ttl: 3600,
  ...extra,
});

afterEach(() => vi.useRealTimers());

describe("generateZoneFile", () => {
  it("makes CNAME, MX and NS targets absolute so they are not treated as relative names", () => {
    const zone = generateZoneFile("example.com", [
      record("CNAME", "www", "example.com"),
      record("MX", "@", "mail.example.com", { priority: 10 }),
      record("NS", "@", "ns1.other.net"),
    ]);

    expect(zone).toMatch(/CNAME\s+example\.com\.$/m);
    expect(zone).toMatch(/MX\s+10 mail\.example\.com\.$/m);
    expect(zone).toMatch(/NS\s+ns1\.other\.net\.$/m);
  });

  it("leaves already-absolute names and '@' targets alone", () => {
    const zone = generateZoneFile("example.com", [
      record("CNAME", "a", "target.example.net."),
      record("CNAME", "b", "@"),
    ]);

    expect(zone).toMatch(/CNAME\s+target\.example\.net\.$/m);
    expect(zone).not.toContain("target.example.net..");
    expect(zone).toMatch(/CNAME\s+@$/m);
  });

  it("uses the zone's own apex NS records instead of the hard-coded defaults", () => {
    const zone = generateZoneFile("example.com", [
      record("NS", "@", "ns1.other.net"),
      record("NS", "@", "ns2.other.net"),
    ]);

    expect(zone).not.toContain("vexlyx.com");
    expect(zone).toMatch(/SOA ns1\.other\.net\./);
    expect(zone.match(/IN {2}NS /g)).toHaveLength(2);
  });

  it("falls back to the default nameservers when the zone has no apex NS records", () => {
    const zone = generateZoneFile("example.com", [record("A", "@", "203.0.113.5")]);

    expect(zone).toContain("@       IN  NS      ns1.vexlyx.com.");
    expect(zone).toContain("@       IN  NS      ns2.vexlyx.com.");
  });

  it("splits long TXT values into <=255-byte strings and does not double-quote", () => {
    const longKey = `v=DKIM1; k=rsa; p=${"A".repeat(400)}`;
    const zone = generateZoneFile("example.com", [record("TXT", "default._domainkey", `"${longKey}"`)]);

    const line = zone.split("\n").find((l) => l.startsWith("default._domainkey"))!;
    const strings = line.match(/"([^"\\]|\\.)*"/g)!;

    expect(strings.length).toBeGreaterThan(1);
    expect(strings.every((s) => s.length - 2 <= 255)).toBe(true);
    expect(strings.join("")).not.toContain('\\"');
    expect(strings.map((s) => s.slice(1, -1)).join("")).toBe(longKey);
  });

  it("escapes quotes inside a TXT value", () => {
    const zone = generateZoneFile("example.com", [record("TXT", "@", 'say "hi"')]);

    expect(zone).toContain('"say \\"hi\\""');
  });

  it("uses a serial that changes on every write so CoreDNS reloads the zone", () => {
    vi.useFakeTimers();
    const serialAt = (iso: string) => {
      vi.setSystemTime(new Date(iso));
      return Number(/(\d+) ; Serial/.exec(generateZoneFile("example.com", []))![1]);
    };

    const first = serialAt("2026-09-19T10:00:00Z");
    const later = serialAt("2026-09-19T10:00:05Z");

    expect(later).toBeGreaterThan(first);
  });

  it("round-trips through parseZoneFile", () => {
    const zone = generateZoneFile("example.com", [
      record("A", "@", "203.0.113.5"),
      record("MX", "@", "mail.example.com", { priority: 10 }),
    ]);

    const parsed = parseZoneFile(zone, "example.com");
    const mx = parsed.records.find((r) => r.type === "MX");

    expect(parsed.records.find((r) => r.type === "A")?.value).toBe("203.0.113.5");
    expect(mx?.priority).toBe(10);
  });
});
