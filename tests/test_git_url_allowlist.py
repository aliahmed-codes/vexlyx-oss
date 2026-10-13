import importlib.util
import io
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock


MODULE_PATH = Path(__file__).parents[1] / "system" / "python" / "git_manager.py"
SPEC = importlib.util.spec_from_file_location("git_manager", MODULE_PATH)
git_manager = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(git_manager)


ALLOWED = [
    "https://github.com/acme/app",
    "https://github.com/acme/app.git",
    "http://github.com/acme/app",
    "https://gitlab.com/group/sub/app.git",
    "https://bitbucket.org/acme/app.git",
    "git@github.com:acme/app.git",
    "git@gitlab.com:acme/app.git",
    "git@bitbucket.org:acme/app.git",
]

# Each entry is a distinct way to make the host clone from somewhere other
# than a supported Git host (issue #62).
REJECTED = [
    "file:///var/lib/vexlyx/projects/other-project",
    "http://169.254.169.254/latest/meta-data/",
    "http://127.0.0.1:5000/x/y",
    "https://internal-host.corp/acme/app.git",
    "ssh://git@internal-host/acme/app.git",
    "git@internal-host:acme/app.git",
    "git://github.com/acme/app.git",
    "ext::sh -c 'id'",
    "https://github.com.evil.example/acme/app",
    "https://github.com@evil.example/acme/app",
    "https://evil.example/github.com/acme/app",
    "--upload-pack=touch /tmp/pwned",
    "https://github.com/acme/app --upload-pack=x",
    "https://github.com/acme/app\nhttp://169.254.169.254/a",
    "https://github.com/acme/app\n",
    "https://github.com/",
    "not a url",
]


def run_clone_expecting_exit(payload: dict) -> dict:
    """Run cmd_clone, returning the JSON written to stdout. Asserts sys.exit(1)."""
    out = io.StringIO()
    with redirect_stdout(out), self_assert_exit():
        git_manager.cmd_clone(payload)
    return json.loads(out.getvalue().strip().splitlines()[-1])


class self_assert_exit:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        if exc_type is SystemExit and exc.code == 1:
            return True
        raise AssertionError("expected the command to exit with status 1")


class TestGitUrlAllowList(unittest.TestCase):
    def test_allowed_urls_are_returned_unchanged(self):
        for url in ALLOWED:
            with self.subTest(url=url):
                self.assertEqual(git_manager.validate_git_url(url), url)

    def test_disallowed_urls_fail_with_invalid_git_url(self):
        for url in REJECTED:
            with self.subTest(url=url):
                out = io.StringIO()
                with redirect_stdout(out), self.assertRaises(SystemExit) as ctx:
                    git_manager.validate_git_url(url)
                self.assertEqual(ctx.exception.code, 1)
                self.assertEqual(json.loads(out.getvalue())["code"], "INVALID_GIT_URL")


class TestCloneRefusesBeforeRunningGit(unittest.TestCase):
    def test_disallowed_url_never_reaches_git(self):
        with tempfile.TemporaryDirectory() as projects_dir:
            for url in REJECTED:
                with self.subTest(url=url), mock.patch.object(
                    git_manager, "_run"
                ) as run, mock.patch("subprocess.run") as sp_run:
                    result = run_clone_expecting_exit(
                        {
                            "projectId": "p1",
                            "gitUrl": url,
                            "branch": "main",
                            "projectsDir": projects_dir,
                        }
                    )
                    self.assertEqual(result["code"], "INVALID_GIT_URL")
                    run.assert_not_called()
                    sp_run.assert_not_called()
                    self.assertFalse((Path(projects_dir) / "p1").exists())

    def test_allowed_url_is_cloned(self):
        with tempfile.TemporaryDirectory() as projects_dir, mock.patch.object(
            git_manager, "_run"
        ) as run:
            out = io.StringIO()
            with redirect_stdout(out):
                git_manager.cmd_clone(
                    {
                        "projectId": "p1",
                        "gitUrl": "https://github.com/acme/app.git",
                        "branch": "main",
                        "projectsDir": projects_dir,
                    }
                )
            self.assertEqual(json.loads(out.getvalue())["action"], "cloned")
            clone_args = run.call_args.args[0]
            self.assertEqual(clone_args[:2], ["git", "clone"])
            self.assertIn("https://github.com/acme/app.git", clone_args)


class TestGitProtocolAllowList(unittest.TestCase):
    def test_env_restricts_git_transports(self):
        env = git_manager._build_env(None)
        self.assertEqual(env["GIT_ALLOW_PROTOCOL"], "http:https:ssh")

    def test_parent_environment_is_not_mutated(self):
        before = dict(os.environ)
        git_manager._build_env("/tmp/key", "token")
        self.assertEqual(dict(os.environ), before)

    @unittest.skipUnless(shutil.which("git"), "git is not installed")
    def test_real_git_refuses_file_transport_with_our_env(self):
        with tempfile.TemporaryDirectory() as repo:
            subprocess.run(["git", "init", "-q", repo], check=True)
            env = git_manager._build_env(None)
            result = subprocess.run(
                ["git", "ls-remote", Path(repo).as_uri()],
                capture_output=True,
                text=True,
                env=env,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("not allowed", result.stderr)


if __name__ == "__main__":
    unittest.main()
