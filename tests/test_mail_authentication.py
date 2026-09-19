"""
test_mail_authentication.py -- Automated test suite for F4.5 SPF/DKIM/DMARC
Auto-Configuration.

All tests exercise the real Fastify API end-to-end (live dev stack). Every
test class other than TestMailAuthApiSecurity is skipped gracefully if the
dev stack isn't running, matching the pattern established by
tests/test_mailbox_management.py.

Tests:
1. Live Fastify API security (401 Unauthorized on unauthenticated requests).
2. A domain with no mailboxes has a deliverability score of 0 and no
   SPF/DKIM/DMARC/MX records.
3. Creating a domain's first mailbox auto-generates SPF, DKIM, DMARC, and MX
   DNS records, raising the score to 100/Excellent, and those records are
   written into the CoreDNS zone file on disk.
4. Creating a second mailbox on the same domain does not create duplicate
   SPF/DMARC/MX records (idempotency / first-mailbox-only gating).
5. POST /api/mail/auth/:domainId/regenerate is idempotent (safe to call
   repeatedly, never creates duplicates).
6. Deleting the SPF record drops the score to 75 with SPF flagged as
   missing; regenerating restores it to 100.
"""

import http.cookiejar
import json
import os
import sys
import unittest
import urllib.error
import urllib.request
import uuid
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT_DIR = Path(__file__).resolve().parent.parent
API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:5000")
COREDNS_ZONES_DIR = ROOT_DIR / "docker" / "coredns" / "zones"

ADMIN_EMAIL = "admin@vexlyx.local"
ADMIN_PASSWORD = "admin123"


class TestMailAuthApiSecurity(unittest.TestCase):
    """Verifies the new F4.5 endpoint enforces authentication."""

    def test_01_unauthenticated_regenerate_returns_401(self):
        for action in ("regenerate", "check"):
            req = urllib.request.Request(
                f"{API_BASE_URL}/api/mail/auth/dummy-id/{action}",
                data=b"{}",
                method="POST",
            )
            req.add_header("Content-Type", "application/json")

            try:
                with urllib.request.urlopen(req) as resp:
                    self.fail(f"Expected 401 Unauthorized for {action}, got {resp.status}")
            except urllib.error.HTTPError as e:
                self.assertEqual(e.code, 401)
            except urllib.error.URLError:
                # If the API server is not running during an isolated test run, skip the live assertion.
                break


class TestMailAuthLiveEndToEnd(unittest.TestCase):
    """
    Live end-to-end coverage for the F4.5 auto-configuration flow: create a
    fresh domain, confirm score 0, create the first mailbox, confirm SPF/
    DKIM/DMARC/MX all appear (score 100) both in the API response and in the
    CoreDNS zone file on disk, confirm idempotency, and confirm the score
    reacts correctly to a manually deleted record.
    """

    def setUp(self):
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
        )
        self._created_mailbox_ids: list[str] = []
        self.domain_id = None
        self.hostname = None

        try:
            self._post(f"{API_BASE_URL}/api/auth/login", {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        except (urllib.error.URLError, ConnectionRefusedError, OSError):
            self.skipTest("API server is not reachable on :5000 (dev stack not running)")
            return

        self.hostname = f"test-mailauth-{uuid.uuid4().hex[:8]}.org"
        try:
            domain = self._post(f"{API_BASE_URL}/api/domains", {"hostname": self.hostname})
        except urllib.error.URLError:
            self.skipTest("Could not create a test domain (dev stack not fully running)")
            return
        self.domain_id = domain["id"] if "id" in domain else domain["domain"]["id"]
        # DNS hosting is opt-in (F5.23): mail records live in a Vexlyx-served zone
        self._post(f"{API_BASE_URL}/api/domains/{self.domain_id}/verify?mock=true")
        self._request(f"{API_BASE_URL}/api/domains/{self.domain_id}/dns-mode", "PATCH", {"mode": "MANAGED"})

    def tearDown(self):
        for mailbox_id in self._created_mailbox_ids:
            try:
                self._delete(f"{API_BASE_URL}/api/mailboxes/{mailbox_id}")
            except Exception:
                pass
        if self.domain_id:
            try:
                self._delete(f"{API_BASE_URL}/api/domains/{self.domain_id}")
            except Exception:
                pass

    def _request(self, url, method="GET", body=None):
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        with self.opener.open(req, timeout=10) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else None

    def _get(self, url):
        return self._request(url, "GET")

    def _post(self, url, body=None):
        return self._request(url, "POST", body or {})

    def _delete(self, url):
        return self._request(url, "DELETE")

    def _find_domain(self):
        domains = self._get(f"{API_BASE_URL}/api/mail/domains")["domains"]
        return next(d for d in domains if d["domainId"] == self.domain_id)

    def _create_mailbox(self, local_part: str) -> dict:
        res = self._post(
            f"{API_BASE_URL}/api/mailboxes",
            {"localPart": local_part, "domainId": self.domain_id, "quota": 256},
        )
        self._created_mailbox_ids.append(res["mailbox"]["id"])
        return res

    def _zone_file_content(self) -> str:
        zone_path = COREDNS_ZONES_DIR / f"{self.hostname}.db"
        if not zone_path.exists():
            self.fail(f"Expected CoreDNS zone file at {zone_path}")
        return zone_path.read_text(encoding="utf-8")

    def test_01_fresh_domain_has_zero_score(self):
        domain = self._find_domain()
        self.assertEqual(domain["deliverabilityScore"], 0)
        self.assertFalse(domain["spfConfigured"])
        self.assertFalse(domain["dmarcConfigured"])
        self.assertFalse(domain["mxConfigured"])
        self.assertFalse(domain["dkimEnabled"])

    def test_connected_domain_lists_registrar_records_and_writes_no_zone(self):
        """F5.26: a CONNECTED domain gets records to publish at its registrar, not a zone."""
        hostname = f"test-connected-{uuid.uuid4().hex[:8]}.org"
        connected = self._post(f"{API_BASE_URL}/api/domains", {"hostname": hostname})
        connected_id = connected["id"]
        try:
            self._post(f"{API_BASE_URL}/api/mail/dkim/{connected_id}")
            entry = next(
                d for d in self._get(f"{API_BASE_URL}/api/mail/domains")["domains"]
                if d["domainId"] == connected_id
            )
            self.assertEqual(entry["dnsMode"], "CONNECTED")
            purposes = {r["purpose"] for r in entry["requiredRecords"]}
            self.assertEqual(purposes, {"MX", "SPF", "DMARC", "DKIM"})

            with self.assertRaises(urllib.error.HTTPError) as ctx:
                self._get(f"{API_BASE_URL}/api/domains/{connected_id}/dns")
            self.assertEqual(ctx.exception.code, 409)

            status = self._post(f"{API_BASE_URL}/api/mail/auth/{connected_id}/check")
            self.assertEqual(status["dnsMode"], "CONNECTED")
        finally:
            self._delete(f"{API_BASE_URL}/api/domains/{connected_id}")

    def test_02_first_mailbox_triggers_full_auto_configuration(self):
        self._create_mailbox("first")

        domain = self._find_domain()
        self.assertEqual(domain["deliverabilityScore"], 100, domain)
        self.assertEqual(domain["deliverabilityGrade"], "Excellent")
        self.assertTrue(domain["spfConfigured"])
        self.assertTrue(domain["dmarcConfigured"])
        self.assertTrue(domain["mxConfigured"])
        self.assertTrue(domain["dkimEnabled"])

        zone_content = self._zone_file_content()
        self.assertIn("v=spf1", zone_content)
        self.assertIn("_dmarc", zone_content)
        self.assertIn("v=DMARC1", zone_content)
        self.assertIn(f"mail.{self.hostname}", zone_content)
        self.assertIn("default._domainkey", zone_content)

    def test_03_second_mailbox_does_not_duplicate_records(self):
        self._create_mailbox("first")
        self._create_mailbox("second")

        records = self._get(f"{API_BASE_URL}/api/domains/{self.domain_id}/dns")
        spf_records = [r for r in records if r["type"] == "TXT" and r["value"].startswith("v=spf1")]
        dmarc_records = [r for r in records if r["type"] == "TXT" and r["name"] == "_dmarc"]
        mx_records = [r for r in records if r["type"] == "MX" and r["name"] == "@"]

        self.assertEqual(len(spf_records), 1, "Must not create duplicate SPF records")
        self.assertEqual(len(dmarc_records), 1, "Must not create duplicate DMARC records")
        self.assertEqual(len(mx_records), 1, "Must not create duplicate MX records")

    def test_04_regenerate_endpoint_is_idempotent(self):
        self._create_mailbox("first")

        result1 = self._post(f"{API_BASE_URL}/api/mail/auth/{self.domain_id}/regenerate")
        result2 = self._post(f"{API_BASE_URL}/api/mail/auth/{self.domain_id}/regenerate")

        self.assertEqual(result1["score"], 100)
        self.assertEqual(result2["score"], 100)

        records = self._get(f"{API_BASE_URL}/api/domains/{self.domain_id}/dns")
        spf_records = [r for r in records if r["type"] == "TXT" and r["value"].startswith("v=spf1")]
        self.assertEqual(len(spf_records), 1, "Regenerate must not create duplicate SPF records")

    def test_05_deleting_spf_drops_score_and_regenerate_restores_it(self):
        self._create_mailbox("first")

        records = self._get(f"{API_BASE_URL}/api/domains/{self.domain_id}/dns")
        spf_record = next(r for r in records if r["type"] == "TXT" and r["value"].startswith("v=spf1"))
        self._delete(f"{API_BASE_URL}/api/domains/{self.domain_id}/dns/{spf_record['id']}")

        domain = self._find_domain()
        self.assertEqual(domain["deliverabilityScore"], 75)
        self.assertFalse(domain["spfConfigured"])

        self._post(f"{API_BASE_URL}/api/mail/auth/{self.domain_id}/regenerate")

        domain = self._find_domain()
        self.assertEqual(domain["deliverabilityScore"], 100)
        self.assertTrue(domain["spfConfigured"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
