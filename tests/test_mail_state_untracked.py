"""The files the panel rewrites at runtime must not be tracked, or the checkout
goes dirty the moment a domain, mailbox or DKIM key is added and the installer
can no longer update it (#139).
"""

import importlib.util
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT_DIR = Path(__file__).resolve().parent.parent
MODULE_PATH = ROOT_DIR / "system" / "python" / "postfix_manager.py"
SPEC = importlib.util.spec_from_file_location("postfix_manager", MODULE_PATH)
postfix_manager = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(postfix_manager)

GIT_ENV = {
    "GIT_AUTHOR_NAME": "Test",
    "GIT_AUTHOR_EMAIL": "test@example.com",
    "GIT_COMMITTER_NAME": "Test",
    "GIT_COMMITTER_EMAIL": "test@example.com",
}

STATE_DIRS = ("docker/postfix/config", "docker/postfix/opendkim")


def git(cwd: Path, *args: str) -> str:
    result = subprocess.run(["git", *args], cwd=cwd, env={**os.environ, **GIT_ENV}, capture_output=True, text=True)
    if result.returncode != 0:
        raise AssertionError(f"git {' '.join(args)} failed: {result.stderr}")
    return result.stdout.strip()


class RuntimeMailStateIsUntrackedTest(unittest.TestCase):
    def setUp(self) -> None:
        if not shutil.which("git"):
            self.skipTest("git is required")
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.repo = Path(self._tmp.name)

    def tracked_in_repo(self, *paths: str) -> list[str]:
        return git(ROOT_DIR, "ls-files", "--", *paths).splitlines()

    def test_only_the_placeholders_are_tracked_in_the_state_directories(self) -> None:
        self.assertEqual(sorted(self.tracked_in_repo(*STATE_DIRS)),
                         ["docker/postfix/config/.gitkeep", "docker/postfix/opendkim/.gitkeep"])

    def test_the_opendkim_config_stays_tracked_outside_the_state_directory(self) -> None:
        self.assertEqual(self.tracked_in_repo("docker/postfix/opendkim.conf"), ["docker/postfix/opendkim.conf"])

    def test_a_clean_checkout_stays_clean_after_the_panel_adds_a_domain_a_mailbox_and_a_key(self) -> None:
        # Recreate what a fresh install has: the tracked postfix files and .gitignore.
        for relative in [*self.tracked_in_repo("docker/postfix"), ".gitignore"]:
            source = ROOT_DIR / relative
            if source.exists():
                target = self.repo / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, target)
        git(self.repo, "init", "--quiet")
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "--quiet", "-m", "fresh install")
        self.assertEqual(git(self.repo, "status", "--porcelain"), "")

        completed = subprocess.CompletedProcess(args=[], returncode=0, stdout="", stderr="")
        previous = Path.cwd()
        os.chdir(self.repo)
        self.addCleanup(os.chdir, previous)
        real_run = subprocess.run

        def docker_is_mocked(command, *args, **kwargs):
            # Key generation may shell out to openssl; only the container calls are faked.
            if isinstance(command, list) and command[:1] == ["docker"]:
                return completed
            return real_run(command, *args, **kwargs)

        with mock.patch.object(postfix_manager.subprocess, "run", side_effect=docker_is_mocked):
            postfix_manager.generate_dkim_keys("example.com", key_size=1024)
            postfix_manager.sync_virtual_domains(["example.com"], ["info@example.com"])
            postfix_manager.sync_virtual_aliases([{"source": "sales@example.com", "destinations": ["info@example.com"]}])
            postfix_manager.generate_dkim_keys("second.example", key_size=1024)

        written = [path for base in STATE_DIRS for path in (self.repo / base).rglob("*") if path.is_file()]
        self.assertGreaterEqual(len(written), 8, "the panel should have written maps, tables and keys")
        self.assertEqual(git(self.repo, "status", "--porcelain"), "",
                         "runtime mail state must not show up as a change")


if __name__ == "__main__":
    unittest.main(verbosity=2)
