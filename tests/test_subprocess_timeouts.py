import importlib.util
import io
import json
import re
import subprocess
import sys
import time
import unittest
from contextlib import redirect_stdout
from pathlib import Path


PYTHON_DIR = Path(__file__).parents[1] / "system" / "python"


def load(name: str):
    path = PYTHON_DIR / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


MANAGERS = {name: load(name) for name in ("docker_manager", "build_manager")}
SLEEP_FOREVER = [sys.executable, "-c", "import time; time.sleep(60)"]


class TestRunBounded(unittest.TestCase):
    def test_returns_the_result_when_the_command_finishes_in_time(self):
        for name, module in MANAGERS.items():
            with self.subTest(manager=name):
                result = module.run_bounded(
                    10,
                    [sys.executable, "-c", "print('hi')"],
                    capture_output=True,
                    text=True,
                )
                self.assertEqual(result.returncode, 0)
                self.assertEqual(result.stdout.strip(), "hi")

    def test_a_hung_command_is_killed_and_reported_as_a_timeout(self):
        for name, module in MANAGERS.items():
            with self.subTest(manager=name):
                out = io.StringIO()
                started = time.monotonic()
                with redirect_stdout(out), self.assertRaises(SystemExit) as ctx:
                    module.run_bounded(1, SLEEP_FOREVER, capture_output=True)
                elapsed = time.monotonic() - started

                self.assertEqual(ctx.exception.code, 1)
                self.assertLess(elapsed, 15)
                payload = json.loads(out.getvalue().strip().splitlines()[-1])
                self.assertEqual(payload["code"], "COMMAND_TIMEOUT")
                self.assertIn("timed out after 1s", payload["error"])


class TestStreamWithDeadline(unittest.TestCase):
    def popen(self, code: str) -> subprocess.Popen:
        proc = subprocess.Popen(
            [sys.executable, "-u", "-c", code],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        self.addCleanup(proc.stdout.close)
        return proc

    def test_delivers_every_line_and_reports_no_timeout(self):
        for name, module in MANAGERS.items():
            with self.subTest(manager=name):
                proc = self.popen("print('a'); print('b')")
                lines = []
                timed_out = module.stream_with_deadline(proc, 10, lines.append)

                self.assertFalse(timed_out)
                self.assertEqual([l.strip() for l in lines], ["a", "b"])
                self.assertEqual(proc.returncode, 0)

    def test_kills_a_process_that_outlives_the_deadline(self):
        for name, module in MANAGERS.items():
            with self.subTest(manager=name):
                proc = self.popen("import time; print('start'); time.sleep(60)")
                lines = []
                started = time.monotonic()
                timed_out = module.stream_with_deadline(proc, 1, lines.append)
                elapsed = time.monotonic() - started

                self.assertTrue(timed_out)
                self.assertLess(elapsed, 15)
                self.assertIsNotNone(proc.poll())
                self.assertIn("start", "".join(lines))


class TestNoUnboundedRun(unittest.TestCase):
    """Regression guard for #52: every subprocess.run goes through run_bounded."""

    def test_only_run_bounded_calls_subprocess_run(self):
        for name in MANAGERS:
            with self.subTest(manager=name):
                source = (PYTHON_DIR / f"{name}.py").read_text(encoding="utf-8")
                calls = re.findall(r"subprocess\.run\(", source)
                self.assertEqual(len(calls), 1, "only run_bounded may call subprocess.run directly")
                helper = source[source.index("def run_bounded") :]
                self.assertIn("subprocess.run(cmd, timeout=timeout", helper.split("\ndef ")[0])


if __name__ == "__main__":
    unittest.main()
