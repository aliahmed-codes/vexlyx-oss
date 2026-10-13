import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    "docker_manager", Path(__file__).parents[1] / "system/python/docker_manager.py"
)
docker_manager = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(docker_manager)


def result(output="", code=0):
    return subprocess.CompletedProcess([], code, output, "")


class RestoreStopSafetyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        (Path(self.temp.name) / "deploy").mkdir()
        self.payload = {"projectDir": self.temp.name}
        for name in ("get_docker_binary", "run_compose", "respond", "log_line"):
            mock = self.enterContext(patch.object(docker_manager, name))
            setattr(self, name, mock)
        self.get_docker_binary.return_value = "docker"
        self.run = self.enterContext(patch.object(docker_manager.subprocess, "run"))

    def assert_rejected(self):
        with self.assertRaises(SystemExit), patch("builtins.print") as output:
            docker_manager.cmd_stop(self.payload)
        self.respond.assert_not_called()
        self.assertIn("CONTAINER_STOP_UNCONFIRMED", output.call_args.args[0])

    def test_confirms_all_services_before_success(self):
        self.run.side_effect = [result("web\napp\n"), result("exited\nexited\n")]
        docker_manager.cmd_stop(self.payload)
        self.assertEqual(self.run.call_args_list[0].args[0], ["docker", "compose", "ps", "--all", "--quiet"])
        self.assertEqual(self.run.call_args.args[0][-2:], ["web", "app"])
        self.respond.assert_called_once_with({"done": True})

    def test_empty_stack_is_safe_after_successful_listing(self):
        self.run.return_value = result()
        docker_manager.cmd_stop(self.payload)
        self.run.assert_called_once()
        self.respond.assert_called_once_with({"done": True})

    def test_rejects_active_or_unknown_sidecar(self):
        for status in ("running", "paused", "restarting", "removing", "unknown"):
            with self.subTest(status=status):
                self.run.side_effect = [result("web\napp\n"), result(f"exited\n{status}\n")]
                self.assert_rejected()

    def test_listing_error_is_not_an_empty_stack(self):
        self.run.return_value = result(code=1)
        self.assert_rejected()

    def test_failed_or_incomplete_inspection_aborts(self):
        for response in (result(code=1), result(), result("exited\n")):
            with self.subTest(response=response):
                self.run.side_effect = [result("web\napp\n"), response]
                self.assert_rejected()

    def test_timeout_and_spawn_failure_abort(self):
        for error in (subprocess.TimeoutExpired("docker", 30), OSError("unavailable")):
            with self.subTest(error=error):
                self.run.side_effect = error
                self.assert_rejected()

    def test_stop_failure_never_reports_success(self):
        self.run_compose.side_effect = SystemExit(1)
        with self.assertRaises(SystemExit):
            docker_manager.cmd_stop(self.payload)
        self.run.assert_not_called()
        self.respond.assert_not_called()


if __name__ == "__main__":
    unittest.main()
