"""Upgrading a server whose runtime mail state is tracked in git (v0.3.0 and older).

Those releases tracked the Postfix maps and OpenDKIM tables the panel rewrites at
runtime, so every install was "dirty" and install.sh refused to update it. The
update now keeps that state: it backs it up, lets git move on, and restores it.

Like test_installer_release_channel.py this sources install.sh and calls
update_checkout against a throwaway local repository, here one that tracks the
state files in its old release and stops tracking them in the new one.
"""

import os
import shutil
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent.parent
INSTALL_SH = ROOT_DIR / "install.sh"

GIT_ENV = {
    "GIT_AUTHOR_NAME": "Test",
    "GIT_AUTHOR_EMAIL": "test@example.com",
    "GIT_COMMITTER_NAME": "Test",
    "GIT_COMMITTER_EMAIL": "test@example.com",
}

POSIX_MODES = os.name != "nt"

CONFIG = "docker/postfix/config"
OPENDKIM = "docker/postfix/opendkim"

OLD_GITIGNORE = "docker/postfix/opendkim/keys/*/\n"
NEW_GITIGNORE = (
    "docker/postfix/config/*\n!docker/postfix/config/.gitkeep\n"
    "docker/postfix/opendkim/*\n!docker/postfix/opendkim/.gitkeep\n"
)

# What v0.3.0 shipped: development leftovers, including a Windows key path.
SHIPPED_DOMAINS = "api.wp-blogs.vexlyx.localhost\ntest-auth.localhost\nwp-blogs.vexlyx.localhost\n"
SHIPPED_KEY_TABLE = (
    "default._domainkey.vexlyx-test.com vexlyx-test.com:default:"
    "D:\\learing\\Vexlyx\\docker\\postfix\\opendkim\\keys\\vexlyx-test.com\\default.private\n"
    "default._domainkey.wp-blogs.vexlyx.localhost wp-blogs.vexlyx.localhost:default:"
    "/etc/opendkim/keys/wp-blogs.vexlyx.localhost/default.private\n"
)
SHIPPED_SIGNING_TABLE = "*@wp-blogs.vexlyx.localhost default._domainkey.wp-blogs.vexlyx.localhost\n"
SHIPPED_TRUSTED_HOSTS = "127.0.0.1\nlocalhost\nvexlyx-test.com\nwp-blogs.vexlyx.localhost\n"

REAL_DOMAINS = ["atlantiqs.org", "html.mindgera.site", "panel.atlantiqs.org"]
MAILBOXES = [f"user{n:02d}@atlantiqs.org" for n in range(13)]


def git(cwd: Path, *args: str) -> str:
    env = {**os.environ, **GIT_ENV}
    result = subprocess.run(["git", *args], cwd=cwd, env=env, capture_output=True, text=True)
    if result.returncode != 0:
        raise AssertionError(f"git {' '.join(args)} failed: {result.stderr}")
    return result.stdout.strip()


def write(path: Path, content: str, mode: int | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8", newline="\n")
    if mode is not None and POSIX_MODES:
        path.chmod(mode)


class MailStateMigrationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.bash = shutil.which("bash")
        if not self.bash or not shutil.which("git"):
            self.skipTest("bash and git are required")
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp = Path(self._tmp.name)
        self.origin = self.tmp / "origin"
        self.origin.mkdir()
        self.backups = self.tmp / "backups"
        git(self.origin, "init", "--quiet", "--initial-branch=main")
        self.seed_old_release()
        self.home = self.tmp / "home"

    # -- fixtures --------------------------------------------------------------

    def seed_old_release(self) -> None:
        """v0.3.0: the runtime state files are tracked."""
        write(self.origin / ".gitignore", OLD_GITIGNORE)
        write(self.origin / "README", "readme\n")
        write(self.origin / CONFIG / "virtual_domains", SHIPPED_DOMAINS)
        write(self.origin / CONFIG / "virtual_mailbox_maps", "test@vexlyx.local vexlyx.local/test/Maildir/\n")
        write(self.origin / CONFIG / "virtual_alias_maps", "\n")
        write(self.origin / OPENDKIM / "KeyTable", SHIPPED_KEY_TABLE)
        write(self.origin / OPENDKIM / "SigningTable", SHIPPED_SIGNING_TABLE)
        write(self.origin / OPENDKIM / "TrustedHosts", SHIPPED_TRUSTED_HOSTS)
        write(self.origin / OPENDKIM / "opendkim.conf", "UserID opendkim\n")
        write(self.origin / OPENDKIM / "keys/vexlyx-test.com/default.txt", "dev public key\n")
        git(self.origin, "add", "-A", "-f")
        git(self.origin, "commit", "--quiet", "-m", "v0.3.0")
        git(self.origin, "tag", "v0.3.0")

    def seed_new_release(self) -> None:
        """v0.3.1: the same files are untracked runtime state."""
        git(self.origin, "rm", "--quiet", "--cached", "-r", CONFIG, OPENDKIM)
        shutil.rmtree(self.origin / "docker")
        write(self.origin / ".gitignore", NEW_GITIGNORE)
        write(self.origin / CONFIG / ".gitkeep", "")
        write(self.origin / OPENDKIM / ".gitkeep", "")
        write(self.origin / "README", "readme 0.3.1\n")
        git(self.origin, "add", "-A")
        git(self.origin, "commit", "--quiet", "-m", "v0.3.1")
        git(self.origin, "tag", "v0.3.1")

    def clone_old(self) -> Path:
        git(self.tmp, "-c", "advice.detachedHead=false", "clone", "--quiet", "--branch", "v0.3.0",
            self.origin.as_uri(), str(self.home))
        return self.home

    def make_dirty_like_production(self, extra_dev_key: bool = False) -> dict[str, bytes]:
        """What a real v0.3.0 server looks like after use; returns the live bytes."""
        home = self.home
        domains = "\n".join([*REAL_DOMAINS, "vexlyx-test.com", "test-postfix-mailer.org"]) + "\n"
        write(home / CONFIG / "virtual_domains", domains)
        write(home / CONFIG / "virtual_mailbox_maps",
              "".join(f"{m} atlantiqs.org/{m.split('@')[0]}/Maildir/\n" for m in MAILBOXES))
        write(home / CONFIG / "virtual_alias_maps", "info@atlantiqs.org user00@atlantiqs.org\n")
        key_lines, sign_lines, hosts = [], [], ["127.0.0.1", "localhost"]
        for domain in REAL_DOMAINS:
            key_lines.append(f"default._domainkey.{domain} {domain}:default:/etc/opendkim/keys/{domain}/default.private")
            sign_lines.append(f"*@{domain} default._domainkey.{domain}")
            hosts.append(domain)
            write(home / OPENDKIM / "keys" / domain / "default.private", f"private key of {domain}\n", 0o600)
            write(home / OPENDKIM / "keys" / domain / "default.txt", f"public key of {domain}\n")
        write(home / OPENDKIM / "KeyTable", SHIPPED_KEY_TABLE + "\n".join(key_lines) + "\n")
        write(home / OPENDKIM / "SigningTable", SHIPPED_SIGNING_TABLE + "\n".join(sign_lines) + "\n")
        write(home / OPENDKIM / "TrustedHosts", "\n".join(hosts) + "\nvexlyx-test.com\n")
        if extra_dev_key:
            write(home / OPENDKIM / "keys/wp-blogs.vexlyx.localhost/default.private", "real key\n", 0o600)
        return self.snapshot()

    def snapshot(self) -> dict[str, bytes]:
        found = {}
        for base in (self.home / CONFIG, self.home / OPENDKIM):
            for path in sorted(base.rglob("*")):
                if path.is_file():
                    found[path.relative_to(self.home).as_posix()] = path.read_bytes()
        return found

    def run_update(self, ref: str | None = "v0.3.1") -> subprocess.CompletedProcess:
        env = {**os.environ, **GIT_ENV, "VEXLYX_REPO_URL": self.origin.as_uri(),
               "VEXLYX_HOME": str(self.home), "VEXLYX_MAIL_BACKUP_DIR": str(self.backups)}
        env.pop("VEXLYX_REPO_REF", None)
        if ref is not None:
            env["VEXLYX_REPO_REF"] = ref
        script = f'source "{INSTALL_SH.as_posix()}"; update_checkout'
        return subprocess.run([self.bash, "-c", script], cwd=self.home, env=env, capture_output=True, text=True)

    def porcelain(self) -> str:
        return git(self.home, "status", "--porcelain")

    def backup_dirs(self) -> list[Path]:
        return sorted(self.backups.iterdir()) if self.backups.exists() else []

    def lines(self, relative: str) -> list[str]:
        return (self.home / relative).read_text(encoding="utf-8").splitlines()

    # -- the upgrade ---------------------------------------------------------

    def test_dirty_v030_server_upgrades_and_keeps_every_real_entry(self) -> None:
        self.clone_old()
        live = self.make_dirty_like_production()
        self.assertNotEqual(self.porcelain(), "")
        self.seed_new_release()

        result = self.run_update()

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(git(self.home, "describe", "--tags", "--exact-match"), "v0.3.1")
        self.assertEqual(self.porcelain(), "", "the checkout must be clean after the upgrade")
        self.assertEqual(git(self.home, "ls-files", CONFIG, OPENDKIM), f"{CONFIG}/.gitkeep\n{OPENDKIM}/.gitkeep")
        after = self.snapshot()
        for domain in REAL_DOMAINS:
            self.assertEqual(after[f"{OPENDKIM}/keys/{domain}/default.private"],
                             live[f"{OPENDKIM}/keys/{domain}/default.private"])
            self.assertEqual(after[f"{OPENDKIM}/keys/{domain}/default.txt"],
                             live[f"{OPENDKIM}/keys/{domain}/default.txt"])
        self.assertEqual(after[f"{CONFIG}/virtual_mailbox_maps"], live[f"{CONFIG}/virtual_mailbox_maps"])
        self.assertEqual(after[f"{CONFIG}/virtual_alias_maps"], live[f"{CONFIG}/virtual_alias_maps"])
        key_table = self.lines(f"{OPENDKIM}/KeyTable")
        for domain in REAL_DOMAINS:
            self.assertTrue(any(line.startswith(f"default._domainkey.{domain} ") for line in key_table), domain)
            self.assertIn(f"*@{domain} default._domainkey.{domain}", self.lines(f"{OPENDKIM}/SigningTable"))
            self.assertIn(domain, self.lines(f"{OPENDKIM}/TrustedHosts"))
            self.assertIn(domain, self.lines(f"{CONFIG}/virtual_domains"))

    def test_shipped_development_entries_are_removed(self) -> None:
        self.clone_old()
        self.make_dirty_like_production()
        self.seed_new_release()
        self.assertEqual(self.run_update().returncode, 0)
        everything = "\n".join(self.snapshot_text())
        for leftover in ("vexlyx-test.com", "wp-blogs.vexlyx.localhost", "test-postfix-mailer.org",
                         "D:\\learing", "test-auth.localhost"):
            self.assertNotIn(leftover, everything, leftover)

    def snapshot_text(self) -> list[str]:
        return [value.decode("utf-8") for key, value in self.snapshot().items()
                if not key.endswith(".private") and "/keys/" not in key]

    def test_a_dev_domain_with_a_private_key_is_kept(self) -> None:
        self.clone_old()
        self.make_dirty_like_production(extra_dev_key=True)
        self.seed_new_release()
        self.assertEqual(self.run_update().returncode, 0)
        self.assertTrue(any(line.startswith("default._domainkey.wp-blogs.vexlyx.localhost ")
                            for line in self.lines(f"{OPENDKIM}/KeyTable")))

    def test_a_backup_of_the_old_state_is_kept_private(self) -> None:
        self.clone_old()
        live = self.make_dirty_like_production()
        self.seed_new_release()
        self.assertEqual(self.run_update().returncode, 0)
        (backup,) = self.backup_dirs()
        if POSIX_MODES:
            self.assertEqual(stat.S_IMODE(backup.stat().st_mode), 0o700)
            self.assertEqual(stat.S_IMODE(self.backups.stat().st_mode), 0o700)
        for relative, content in live.items():
            self.assertEqual((backup / relative).read_bytes(), content, relative)

    @unittest.skipUnless(POSIX_MODES, "POSIX file modes are not meaningful on Windows")
    def test_private_keys_keep_their_mode(self) -> None:
        self.clone_old()
        self.make_dirty_like_production()
        self.seed_new_release()
        self.assertEqual(self.run_update().returncode, 0)
        key = self.home / OPENDKIM / "keys/atlantiqs.org/default.private"
        self.assertEqual(stat.S_IMODE(key.stat().st_mode), 0o600)

    def test_running_again_changes_nothing(self) -> None:
        self.clone_old()
        self.make_dirty_like_production()
        self.seed_new_release()
        self.assertEqual(self.run_update().returncode, 0)
        before = self.snapshot()
        second = self.run_update()
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertIn("Already on release v0.3.1", second.stdout)
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(len(self.backup_dirs()), 1, "an unchanged tree needs no second backup")

    # -- the safety nets ------------------------------------------------------

    def test_any_other_local_change_keeps_the_old_refusal(self) -> None:
        self.clone_old()
        live = self.make_dirty_like_production()
        write(self.home / "README", "edited by the operator\n")
        self.seed_new_release()

        result = self.run_update()

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Local changes detected", result.stdout)
        self.assertEqual(git(self.home, "describe", "--tags", "--exact-match"), "v0.3.0")
        self.assertEqual(self.snapshot(), live)
        self.assertEqual(self.backup_dirs(), [])

    def test_a_failed_update_puts_the_state_back(self) -> None:
        self.clone_old()
        live = self.make_dirty_like_production()
        self.seed_new_release()
        shutil.rmtree(self.origin, onerror=lambda func, path, _: (os.chmod(path, stat.S_IWRITE), func(path)))  # the remote vanishes: the fetch fails

        result = self.run_update()

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(git(self.home, "describe", "--tags", "--exact-match"), "v0.3.0")
        self.assertEqual(self.snapshot(), live, "a failed update must leave the live state exactly as it was")
        self.assertEqual(len(self.backup_dirs()), 1)

    def test_staying_on_the_same_release_loses_nothing(self) -> None:
        self.clone_old()
        live = self.make_dirty_like_production()

        result = self.run_update(ref="v0.3.0")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.snapshot(), live)

    def test_a_clean_checkout_updates_without_a_backup(self) -> None:
        self.clone_old()
        self.seed_new_release()
        result = self.run_update()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(git(self.home, "describe", "--tags", "--exact-match"), "v0.3.1")
        self.assertEqual(self.backup_dirs(), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
