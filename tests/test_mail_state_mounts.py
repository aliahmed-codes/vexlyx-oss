"""Runtime mail state is mounted as directories and failures are visible (#36, #139).

Build with: docker build -t vexlyx-postfix:credentials-test docker/postfix
Run with: python -m unittest tests.test_mail_state_mounts -v
Uses throwaway containers and a temporary host directory; publishes no ports.

VEXLYX_TEST_TMP can point at a directory Docker is allowed to mount (Docker
Desktop on Windows cannot mount the default temp directory when it contains
spaces).
"""

import os
import shutil
import stat
import tempfile
import time
import unittest
import uuid
from pathlib import Path

from tests.test_mail_credential_security import docker


IMAGE = "vexlyx-postfix:credentials-test"
VIRTUAL = "/etc/postfix/vexlyx"
POSIX_MODES = os.name != "nt"


class MailStateMountTest(unittest.TestCase):
    def setUp(self) -> None:
        self.name = "vexlyx-mail-state-" + uuid.uuid4().hex[:10]
        self.root = Path(tempfile.mkdtemp(prefix="mail-state-", dir=os.environ.get("VEXLYX_TEST_TMP")))
        self.config = self.root / "config"
        self.opendkim = self.root / "opendkim"
        self.config.mkdir()
        self.opendkim.mkdir()
        self.addCleanup(lambda: shutil.rmtree(self.root, ignore_errors=True))
        self.addCleanup(lambda: docker("rm", "-f", self.name, check=False))

    def start(self) -> None:
        docker("run", "-d", "--name", self.name, "-e", "VEXLYX_SEED_DEV_FIXTURES=false",
               "-v", f"{self.config}:{VIRTUAL}", "-v", f"{self.opendkim}:/etc/opendkim", IMAGE)

    def health(self) -> str:
        return docker("inspect", "-f", "{{.State.Health.Status}}", self.name).stdout.strip()

    def wait_for_health(self, wanted: str = "healthy", seconds: int = 90) -> None:
        deadline = time.time() + seconds
        status = ""
        while time.time() < deadline:
            status = self.health()
            if status == wanted:
                return
            time.sleep(2)
        self.fail(f"container is {status!r}, wanted {wanted!r}:\n{docker('logs', self.name, check=False).stderr}")

    def exec(self, *command: str, check: bool = True):
        return docker("exec", self.name, *command, check=check)

    # -- a fresh install ------------------------------------------------------

    def test_empty_state_starts_healthy_and_builds_empty_maps(self) -> None:
        self.start()
        self.wait_for_health()
        for name in ("virtual_domains", "virtual_mailbox_maps", "virtual_alias_maps"):
            self.assertTrue((self.config / name).exists(), name)
        self.assertTrue((self.config / "virtual_mailbox_maps.lmdb").exists())
        self.assertEqual((self.config / "virtual_mailbox_maps").read_text(encoding="utf-8"), "")
        self.assertTrue((self.opendkim / "KeyTable").exists())
        self.assertTrue((self.opendkim / "SigningTable").exists())

    # -- #36: the file under the mount is replaced, as git does ----------------

    def test_container_sees_a_file_that_was_replaced_on_the_host(self) -> None:
        self.start()
        self.wait_for_health()
        replacement = self.config / "virtual_mailbox_maps.new"
        replacement.write_text("a@example.org example.org/a/Maildir/\n", encoding="utf-8", newline="\n")
        os.replace(replacement, self.config / "virtual_mailbox_maps")  # new inode, like a git checkout
        self.assertEqual(self.exec("cat", f"{VIRTUAL}/virtual_mailbox_maps").stdout,
                         "a@example.org example.org/a/Maildir/\n")

    def test_a_source_newer_than_its_compiled_map_is_unhealthy_until_rebuilt(self) -> None:
        self.start()
        self.wait_for_health()
        time.sleep(1.1)  # mtime granularity
        (self.config / "virtual_mailbox_maps").write_text("a@example.org example.org/a/Maildir/\n",
                                                          encoding="utf-8", newline="\n")
        stale = self.exec("/usr/local/bin/healthcheck.sh", check=False)
        self.assertNotEqual(stale.returncode, 0)
        self.assertIn("changed after its map was built", stale.stderr)
        rebuild = (f"cp {VIRTUAL}/virtual_mailbox_maps /tmp/m && postmap lmdb:/tmp/m && "
                   f"cp /tmp/m.lmdb {VIRTUAL}/.m.new && mv -f {VIRTUAL}/.m.new {VIRTUAL}/virtual_mailbox_maps.lmdb")
        self.exec("sh", "-c", rebuild)
        self.assertEqual(self.exec("/usr/local/bin/healthcheck.sh", check=False).returncode, 0)
        looked_up = self.exec("postmap", "-q", "a@example.org", f"lmdb:{VIRTUAL}/virtual_mailbox_maps")
        self.assertEqual(looked_up.stdout.strip(), "example.org/a/Maildir/")

    # -- a map that cannot be built is loud ------------------------------------

    def test_a_map_that_cannot_be_compiled_stops_the_container_with_an_error(self) -> None:
        (self.config / "virtual_mailbox_maps").mkdir()  # cp of a directory fails
        self.start()
        deadline = time.time() + 60
        while time.time() < deadline:
            if docker("inspect", "-f", "{{.State.Running}}", self.name).stdout.strip() == "false":
                break
            time.sleep(1)
        else:
            self.fail("the container kept running with an unbuildable map")
        self.assertEqual(docker("inspect", "-f", "{{.State.ExitCode}}", self.name).stdout.strip(), "1")
        logs = docker("logs", self.name, check=False).stderr
        self.assertIn("failed to compile virtual_mailbox_maps", logs)
        self.assertIn("refusing to start", logs)

    # -- DKIM keys -------------------------------------------------------------

    @unittest.skipUnless(POSIX_MODES, "POSIX file modes are not meaningful on Windows")
    def test_a_restart_leaves_private_keys_at_0600_for_opendkim(self) -> None:
        key = self.opendkim / "keys/example.org/default.private"
        key.parent.mkdir(parents=True)
        key.write_text("not a real key\n", encoding="utf-8")
        key.chmod(0o640)
        self.start()
        self.wait_for_health()
        self.assertEqual(self.exec("stat", "-c", "%a %U", "/etc/opendkim/keys/example.org/default.private").stdout.strip(),
                         "600 opendkim")
        self.assertEqual(stat.S_IMODE(key.stat().st_mode) & 0o077, 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
