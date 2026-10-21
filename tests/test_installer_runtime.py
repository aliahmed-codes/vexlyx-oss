"""Installer hardening (#72): pinned NodeSource key and a password that never reaches the log."""

import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent.parent
INSTALL_DIR = ROOT_DIR / "system" / "scripts" / "install"
STEPS = INSTALL_DIR / "steps"

PINNED = "6F71F525282841EEDAF851B42F59B5F99B1BE0B4"
OTHER = "0000000000000000000000000000000000000000"
PASSWORD = "s3cret-generated-admin-pw"


def posix(path: Path) -> str:
    return path.as_posix()


class InstallerRuntimeTest(unittest.TestCase):
    def setUp(self) -> None:
        self.bash = shutil.which("bash")
        if not self.bash:
            self.skipTest("bash is required to execute the installer steps")
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp = Path(self._tmp.name)
        self.bin = self.tmp / "bin"
        self.bin.mkdir()

    def stub(self, name: str, body: str) -> None:
        path = self.bin / name
        path.write_text("#!/usr/bin/env bash\n" + body, encoding="utf-8")
        path.chmod(0o755)

    # -- Node.js step -------------------------------------------------------

    def run_runtime_step(self, key_fingerprint: str) -> subprocess.CompletedProcess:
        calls = self.tmp / "calls.log"
        node_marker = self.tmp / "node-installed"
        self.stub("curl", 'echo "curl $*" >> "$CALLS"; out=""; while [[ $# -gt 0 ]]; do [[ $1 == -o ]] && out=$2; shift; done; echo "armored key" > "$out"\n')
        self.stub("gpg", 'if [[ "$1" == "--show-keys" ]]; then printf "pub:-:2048:1:2F59B5F99B1BE0B4:1::::::\\nfpr:::::::::%s:\\nfpr:::::::::%s:\\n" "$KEY_FPR" "$KEY_FPR"; else cat; fi\n')
        self.stub("dpkg", 'echo amd64\n')
        self.stub("apt-get", 'echo "apt-get $*" >> "$CALLS"; [[ "$*" == *nodejs* ]] && touch "$NODE_MARKER"; exit 0\n')
        self.stub("node", 'echo v22.11.0\n')
        for name in ("corepack", "pnpm", "pip3"):
            self.stub(name, 'exit 0\n')
        self.stub("python", 'echo "Python 3.12.0"\n')
        self.stub("python3", 'echo "Python 3.12.0"\n')

        env = os.environ.copy()
        env.update(
            {
                "PATH": f"{posix(self.bin)}{os.pathsep}{env.get('PATH', '')}",
                "CALLS": posix(calls),
                "NODE_MARKER": posix(node_marker),
                "KEY_FPR": key_fingerprint,
                "SCRIPT_DIR": posix(INSTALL_DIR),
                "VEXLYX_APT_KEYRING_DIR": posix(self.tmp / "keyrings"),
                "VEXLYX_APT_SOURCES_DIR": posix(self.tmp / "sources.list.d"),
                "VEXLYX_APT_PREFERENCES_DIR": posix(self.tmp / "preferences.d"),
            }
        )
        command = (
            "log_step() { echo \"STEP $*\"; }; log_ok() { echo \"OK $*\"; }; "
            "log_warn() { echo \"WARN $*\"; }; die() { echo \"DIE $*\" >&2; exit 1; }; "
            'has_cmd() { if [[ "$1" == node ]]; then [[ -e "$NODE_MARKER" ]]; else return 0; fi; }; '
            f'source "{posix(STEPS / "04-runtime.sh")}"'
        )
        return subprocess.run([self.bash, "-c", command], capture_output=True, text=True, env=env)

    def calls(self) -> str:
        path = self.tmp / "calls.log"
        return path.read_text(encoding="utf-8") if path.exists() else ""

    def test_no_remote_script_is_executed(self) -> None:
        script = (STEPS / "04-runtime.sh").read_text(encoding="utf-8")
        self.assertNotIn("setup_22.x", script)
        self.assertNotIn("| bash -", script)

    def test_pinned_fingerprint_file_matches_the_expected_key(self) -> None:
        text = (INSTALL_DIR / "nodesource.fingerprint").read_text(encoding="utf-8")
        self.assertIn(PINNED, text)

    def test_key_with_wrong_fingerprint_aborts_before_trusting_it(self) -> None:
        result = self.run_runtime_step(OTHER)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("does not match the pinned fingerprint", result.stderr)
        self.assertNotIn("apt-get", self.calls())
        self.assertFalse((self.tmp / "keyrings" / "nodesource.gpg").exists())
        self.assertFalse((self.tmp / "sources.list.d" / "nodesource.list").exists())

    def test_key_with_correct_fingerprint_installs_from_the_pinned_repository(self) -> None:
        result = self.run_runtime_step(PINNED)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.tmp / "keyrings" / "nodesource.gpg").exists())
        sources = (self.tmp / "sources.list.d" / "nodesource.list").read_text(encoding="utf-8")
        self.assertIn("https://deb.nodesource.com/node_22.x", sources)
        self.assertIn("signed-by=", sources)
        self.assertIn("apt-get install -y --no-install-recommends nodejs", self.calls())

    def test_rerun_is_a_no_op_once_node_is_installed(self) -> None:
        first = self.run_runtime_step(PINNED)
        self.assertEqual(first.returncode, 0, first.stderr)
        keyring = (self.tmp / "keyrings" / "nodesource.gpg").read_bytes()
        calls_after_first = self.calls()

        second = self.run_runtime_step(PINNED)
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertIn("Node.js already installed", second.stdout)
        new_calls = self.calls()[len(calls_after_first):]
        self.assertNotIn("curl", new_calls)
        self.assertNotIn("nodejs", new_calls)
        self.assertEqual((self.tmp / "keyrings" / "nodesource.gpg").read_bytes(), keyring)

    # -- Admin password -----------------------------------------------------

    def run_summary(self, *, created: bool, generated: bool, terminal: bool = True) -> tuple[subprocess.CompletedProcess, str]:
        log = self.tmp / "install.log"
        log.write_text("", encoding="utf-8")
        self.stub("docker", "exit 1\n")
        env = os.environ.copy()
        env["PATH"] = f"{posix(self.bin)}{os.pathsep}{env.get('PATH', '')}"
        # Mirrors run.sh: keep the real stdout on fd 3, then tee everything into the log.
        fd3 = "exec 3>&1; " if terminal else "exec 3>&-; "
        command = (
            f'source "{posix(INSTALL_DIR / "lib.sh")}"; '
            f'VEXLYX_STATE_FILE="{posix(log)}"; VEXLYX_SECRETS_FILE=/etc/vexlyx/vexlyx.env; '
            "log_step() { echo \"STEP $*\"; }; log_warn() { echo \"WARN $*\"; }; sleep() { :; }; "
            "VEXLYX_DOMAIN=panel.example.com; VEXLYX_BASE_DOMAIN=panel.example.com; VEXLYX_ADMIN_EMAIL=a@example.com; "
            "VEXLYX_MAIL_HOSTNAME=mail.example.com; VEXLYX_MAIL_DOMAIN=example.com; VEXLYX_HOME=/opt/vexlyx; VEXLYX_PUBLIC_IP=; "
            f"VEXLYX_ADMIN_PASSWORD={PASSWORD}; ADMIN_USER_CREATED={'true' if created else 'false'}; "
            f"ADMIN_PASSWORD_WAS_GENERATED={'true' if generated else 'false'}; "
            f'{fd3}exec > >(tee -a "{posix(log)}") 2>&1; '
            f'source "{posix(STEPS / "16-summary.sh")}"; '
            "command sleep 0.5"
        )
        result = subprocess.run([self.bash, "-c", command], capture_output=True, text=True, env=env, stdin=subprocess.DEVNULL)
        return result, log.read_text(encoding="utf-8")

    def test_generated_password_is_shown_on_the_terminal_but_never_logged(self) -> None:
        result, log_text = self.run_summary(created=True, generated=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(PASSWORD, result.stdout)
        self.assertNotIn(PASSWORD, log_text)
        self.assertIn("not recorded in", log_text)

    def test_password_wording_states_where_it_lives(self) -> None:
        result, _ = self.run_summary(created=True, generated=True)
        self.assertNotIn("not stored anywhere", result.stdout)
        self.assertIn("Argon2id hash", result.stdout)

    def test_existing_admin_gets_no_password_line_on_a_rerun(self) -> None:
        result, log_text = self.run_summary(created=False, generated=True)
        self.assertNotIn(PASSWORD, result.stdout)
        self.assertNotIn(PASSWORD, log_text)
        self.assertIn("already existed", result.stdout)

    def test_password_is_never_printed_when_no_terminal_is_attached(self) -> None:
        result, log_text = self.run_summary(created=True, generated=True, terminal=False)
        if PASSWORD in result.stdout:
            self.skipTest("a controlling terminal is available in this environment")
        self.assertNotIn(PASSWORD, log_text)

    def test_run_script_keeps_the_real_stdout_before_starting_the_tee(self) -> None:
        run_sh = (INSTALL_DIR / "run.sh").read_text(encoding="utf-8")
        self.assertIn("exec 3>&1", run_sh)
        self.assertLess(run_sh.index("exec 3>&1"), run_sh.index("tee -a"))

    def test_installer_never_enables_shell_tracing(self) -> None:
        for script in [INSTALL_DIR / "run.sh", INSTALL_DIR / "lib.sh", *STEPS.glob("*.sh")]:
            text = script.read_text(encoding="utf-8")
            self.assertNotIn("set -x", text, script.name)
            self.assertNotIn("set -o xtrace", text, script.name)


if __name__ == "__main__":
    unittest.main(verbosity=2)
