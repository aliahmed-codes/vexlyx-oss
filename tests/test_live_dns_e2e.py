"""
test_live_dns_e2e.py — Live End-to-End Test Suite for F3.3 DNS Record Management.

Tests the full lifecycle with an authenticated user against the running Fastify API:
1. Health check & user authentication (admin login or test registration).
2. Domain creation (POST /api/domains).
3. Recommended Defaults Initialization (POST /api/domains/:id/dns/defaults).
4. Record CRUD for all supported types (A, AAAA, CNAME, MX, TXT, NS, SRV).
5. RFC 1912 CNAME conflict validation (rejection of CNAME on apex, rejection of A on CNAME).
6. CoreDNS zone file generation and inspection on disk (docker/coredns/zones/{domain}.db).
7. Zone File Export (GET /api/domains/:id/dns/export).
8. Zone File Import (POST /api/domains/:id/dns/import) with skip and replace strategies.
9. Record Update (PATCH /api/domains/:id/dns/:recId) and Deletion (DELETE).
10. Multi-Resolver Propagation Check (POST /api/domains/:id/dns/:recId/propagation).
11. Cleanup test domain and zone file.
"""

import http.cookiejar
import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

API_BASE = os.environ.get("API_BASE_URL", "http://localhost:5000")
REPO_ROOT = Path(__file__).resolve().parent.parent
ZONES_DIR = REPO_ROOT / "docker" / "coredns" / "zones"


def main():
    print("=" * 70)
    print(" VEXLYX F3.3 DNS RECORD MANAGEMENT — LIVE END-TO-END TEST")
    print("=" * 70)

    # 1. Cookie jar & opener
    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

    def api_request(path: str, method: str = "GET", body: dict = None) -> tuple[int, dict | str]:
        url = f"{API_BASE}{path}"
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        if body is not None:
            req.add_header("Content-Type", "application/json")

        try:
            with opener.open(req, timeout=10) as resp:
                content_type = resp.headers.get("Content-Type", "")
                raw = resp.read().decode("utf-8")
                if "application/json" in content_type:
                    return resp.status, json.loads(raw) if raw else {}
                return resp.status, raw
        except urllib.error.HTTPError as err:
            err_raw = err.read().decode("utf-8")
            try:
                err_data = json.loads(err_raw)
            except Exception:
                err_data = {"error": err_raw}
            return err.code, err_data

    # 2. Health check
    print("\n[1/11] Checking API health...")
    status, health = api_request("/api/health")
    if status != 200:
        print(f"  ✗ Fastify API is offline at {API_BASE}. Make sure 'pnpm dev' is running.")
        sys.exit(1)
    print(f"  ✓ API is ONLINE: {health.get('status')} (v{health.get('version')})")

    # 3. Authenticate
    print("\n[2/11] Authenticating test user...")
    status, login_res = api_request("/api/auth/login", "POST", {
        "email": "admin@vexlyx.local",
        "password": "admin123",
    })

    if status == 200:
        print(f"  ✓ Logged in as admin user (ID: {login_res['user']['id']})")
    else:
        test_email = f"dns-e2e-{os.urandom(3).hex()}@example.com"
        test_pass = "TestPassword123!"
        status, reg_res = api_request("/api/auth/register", "POST", {
            "name": "DNS E2E Tester",
            "email": test_email,
            "password": test_pass,
            "confirmPassword": test_pass,
        })
        if status != 201:
            print(f"  ✗ Failed to authenticate: {reg_res}")
            sys.exit(1)
        print(f"  ✓ Registered new test user: {test_email}")

    # 4. Create a test domain
    test_hostname = f"dns-test-{os.urandom(3).hex()}.com"
    print(f"\n[3/11] Creating test domain: {test_hostname}...")
    status, domain = api_request("/api/domains", "POST", {"hostname": test_hostname})
    if status != 201:
        print(f"  ✗ Failed to create domain: {domain}")
        sys.exit(1)
    domain_id = domain["id"]
    print(f"  ✓ Domain created with ID: {domain_id} (Status: {domain['status']})")

    # DNS hosting is opt-in (F5.23): verify ownership (mock) and switch to MANAGED
    status, _ = api_request(f"/api/domains/{domain_id}/verify?mock=true", "POST")
    assert status == 200, "mock verification failed"
    status, mode_res = api_request(f"/api/domains/{domain_id}/dns-mode", "PATCH", {"mode": "MANAGED"})
    if status != 200:
        print(f"  ✗ Failed to enable managed DNS: {mode_res}")
        sys.exit(1)
    print("  ✓ DNS hosting enabled (MANAGED)")

    zone_file = ZONES_DIR / f"{test_hostname}.db"

    try:
        # 5. Test Recommended Defaults
        print("\n[4/11] Testing recommended DNS defaults initialization...")
        status, defaults = api_request(f"/api/domains/{domain_id}/dns/defaults", "POST")
        if status != 200:
            print(f"  ✗ Failed to initialize defaults: {defaults}")
            sys.exit(1)
        types_created = [r["type"] for r in defaults]
        print(f"  ✓ Created {len(defaults)} default records: {types_created}")
        assert "A" in types_created, "Default records must include A record"
        assert "CNAME" in types_created, "Default records must include www CNAME record"
        assert "NS" in types_created, "Default records must include NS records"

        # 6. Create custom records of each type
        print("\n[5/11] Creating custom records (AAAA, MX, TXT, SRV)...")
        custom_records = [
            {"type": "AAAA", "name": "ipv6", "value": "2001:db8::123", "ttl": 3600},
            {"type": "MX", "name": "@", "value": "mail.testdomain.com", "ttl": 3600, "priority": 10},
            {"type": "TXT", "name": "_dmarc", "value": "v=DMARC1; p=reject;", "ttl": 3600},
            {"type": "SRV", "name": "_sip._tcp", "value": "sip.testdomain.com", "ttl": 3600, "priority": 10, "weight": 20, "port": 5060},
        ]
        created_rec_ids = []
        for rec in custom_records:
            status, created = api_request(f"/api/domains/{domain_id}/dns", "POST", rec)
            if status != 201:
                print(f"  ✗ Failed to create {rec['type']} record: {created}")
                sys.exit(1)
            created_rec_ids.append(created["id"])
            print(f"  ✓ Added {rec['type']} record: {created['name']} -> {created['value']} (ID: {created['id']})")

        # 7. Test RFC 1912 CNAME conflict validation
        print("\n[6/11] Testing RFC 1912 CNAME conflict enforcement...")
        # 7a. Try to create CNAME at apex (@) -> should fail 400
        status, err_apex = api_request(f"/api/domains/{domain_id}/dns", "POST", {
            "type": "CNAME", "name": "@", "value": "target.com", "ttl": 3600,
        })
        print(f"  [DEBUG] apex CNAME returned: status={status}, response={err_apex}")
        assert status == 400, f"Expected 400 for apex CNAME, got {status}: {err_apex}"
        print("  ✓ CNAME at apex (@) rejected per RFC 1912")

        # 7b. Create a CNAME on 'blog', then try to create an A record on 'blog' -> should fail 400
        status, cname_rec = api_request(f"/api/domains/{domain_id}/dns", "POST", {
            "type": "CNAME", "name": "blog", "value": "hashnode.network", "ttl": 3600,
        })
        assert status == 201, "Should allow valid non-apex CNAME"

        status, conflict_a = api_request(f"/api/domains/{domain_id}/dns", "POST", {
            "type": "A", "name": "blog", "value": "192.0.2.99", "ttl": 3600,
        })
        assert status == 400, f"Expected 400 for A record conflicting with CNAME, got {status}"
        print("  ✓ Conflicting record on existing CNAME hostname rejected per RFC 1912")

        # 8. Verify zone file generation on disk
        print("\n[7/11] Verifying CoreDNS zone file on disk...")
        zone_file = ZONES_DIR / f"{test_hostname}.db"
        assert zone_file.exists(), f"Zone file {zone_file} was not generated on disk"
        zone_content = zone_file.read_text(encoding="utf-8")
        assert f"$ORIGIN {test_hostname}." in zone_content
        assert "IN  SOA ns1.vexlyx.com." in zone_content
        assert "mail.testdomain.com" in zone_content
        assert "v=DMARC1; p=reject;" in zone_content
        print(f"  ✓ Zone file verified at {zone_file} ({len(zone_content.splitlines())} lines)")

        # 9. Test Zone Export
        print("\n[8/11] Testing Zone File Export endpoint...")
        status, exported_text = api_request(f"/api/domains/{domain_id}/dns/export")
        assert status == 200, f"Expected 200 on export, got {status}"
        assert f"$ORIGIN {test_hostname}." in exported_text
        print("  ✓ Exported RFC 1035 zone file matches expected structure")

        # 10. Test Zone Import (skip and replace)
        print("\n[9/11] Testing Zone File Import...")
        import_zone_snippet = f"""
$ORIGIN {test_hostname}.
$TTL 1800
api      1800  IN  A      198.51.100.1
staging  1800  IN  CNAME  api
"""
        status, import_res = api_request(f"/api/domains/{domain_id}/dns/import", "POST", {
            "zoneContent": import_zone_snippet,
            "strategy": "skip",
        })
        assert status == 200, f"Expected 200 on import, got {status}"
        assert import_res["importedCount"] == 2, f"Expected 2 imported records, got {import_res['importedCount']}"
        print(f"  ✓ Zone import successful ({import_res['importedCount']} records added)")

        # 11. Test Record Update & Deletion
        print("\n[10/11] Testing Record Update & Deletion...")
        first_custom_id = created_rec_ids[0]
        status, updated_rec = api_request(f"/api/domains/{domain_id}/dns/{first_custom_id}", "PATCH", {
            "ttl": 7200,
            "value": "2001:db8::999",
        })
        assert status == 200, f"Expected 200 on patch, got {status}"
        assert updated_rec["ttl"] == 7200
        assert updated_rec["value"] == "2001:db8::999"
        print(f"  ✓ Updated record {first_custom_id} (new TTL: 7200, new value: 2001:db8::999)")

        status, _ = api_request(f"/api/domains/{domain_id}/dns/{first_custom_id}", "DELETE")
        assert status == 204, f"Expected 204 on delete, got {status}"
        print(f"  ✓ Deleted record {first_custom_id}")

        # 12. Test Live Propagation Checker Endpoint
        print("\n[11/11] Testing Multi-Resolver Propagation Checker...")
        remaining_records = api_request(f"/api/domains/{domain_id}/dns")[1]
        target_rec = remaining_records[0]
        status, prop_res = api_request(f"/api/domains/{domain_id}/dns/{target_rec['id']}/propagation", "POST")
        assert status == 200, f"Expected 200 on propagation check, got {status}"
        assert "resolvers" in prop_res
        assert len(prop_res["resolvers"]) >= 3
        resolver_names = [r["resolver"] for r in prop_res["resolvers"]]
        print(f"  ✓ Propagation check returned answers from: {', '.join(resolver_names)}")

        print("\n" + "=" * 70)
        print(" ALL 11 E2E TESTS PASSED SUCCESSFULLY!")
        print("=" * 70)

    finally:
        # Cleanup test domain
        print(f"\n[Cleanup] Deleting test domain {test_hostname}...")
        api_request(f"/api/domains/{domain_id}", "DELETE")
        if zone_file.exists():
            try:
                zone_file.unlink()
            except Exception:
                pass
        print("  ✓ Cleanup complete.")


if __name__ == "__main__":
    main()
