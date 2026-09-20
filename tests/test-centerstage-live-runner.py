#!/usr/bin/env python3
"""Regression tests for the autosave cleanup helpers in the live runner."""
import importlib.util
from pathlib import Path
import subprocess
import unittest
from unittest import mock


RUNNER = Path(__file__).with_name("verify-centerstage-live.py")


def load_runner():
    spec = importlib.util.spec_from_file_location("verify_centerstage_live", RUNNER)
    module = importlib.util.module_from_spec(spec)
    with mock.patch.object(subprocess, "run", side_effect=AssertionError("live command called")):
        spec.loader.exec_module(module)
    return module


class AutosaveCleanupTests(unittest.TestCase):
    def test_active_service_is_paused_and_restarted(self):
        runner = load_runner()
        commands = []
        runner.active = lambda unit: unit == runner.AUTOSAVE_SERVICE
        def fake_run(*args):
            commands.append(args)
            if args[2] == "show":
                return "0" if any("ExecMainStatus" in arg for arg in args) else "success"
            return "success"

        runner.run = fake_run

        state = runner.capture_autosave_state()
        runner.pause_autosave(state)
        errors = runner.restore_autosave(state)

        self.assertEqual(errors, [])
        self.assertIn(("systemctl", "--user", "stop", runner.AUTOSAVE_SERVICE), commands)
        self.assertIn(("systemctl", "--user", "restart", runner.AUTOSAVE_SERVICE), commands)

    def test_job_triggered_while_timer_is_stopping_is_paused_and_restored(self):
        runner = load_runner()
        commands = []
        job_running = False

        def is_active(unit):
            return unit == runner.AUTOSAVE_TIMER or job_running

        def fake_run(*args):
            nonlocal job_running
            commands.append(args)
            if args[2:] == ("stop", runner.AUTOSAVE_TIMER):
                job_running = True  # Timer fired just before its stop completed.
            if args[2] == "show":
                return "0" if any("ExecMainStatus" in arg for arg in args) else "success"
            return "success"

        runner.active = is_active
        runner.run = fake_run
        state = runner.capture_autosave_state()
        self.assertFalse(state["service"])
        runner.pause_autosave(state)
        self.assertIn(("systemctl", "--user", "stop", runner.AUTOSAVE_SERVICE), commands)
        self.assertEqual(runner.restore_autosave(state), [])
        self.assertIn(("systemctl", "--user", "restart", runner.AUTOSAVE_SERVICE), commands)

    def test_inactive_service_is_not_started(self):
        runner = load_runner()
        commands = []
        runner.active = lambda unit: False
        runner.run = lambda *args: commands.append(args) or "success"

        state = runner.capture_autosave_state()
        runner.pause_autosave(state)
        errors = runner.restore_autosave(state)

        self.assertEqual(errors, [])
        self.assertNotIn(("systemctl", "--user", "start", runner.AUTOSAVE_SERVICE), commands)
        self.assertNotIn(("systemctl", "--user", "restart", runner.AUTOSAVE_SERVICE), commands)

    def test_timer_restore_is_independent_of_service_failure(self):
        runner = load_runner()
        commands = []
        runner.active = lambda unit: unit == runner.AUTOSAVE_TIMER

        def fake_run(*args):
            commands.append(args)
            if args[3] == runner.AUTOSAVE_SERVICE and args[2] == "restart":
                raise RuntimeError("service restart failed")
            if args[2] == "show":
                return "0" if any("ExecMainStatus" in arg for arg in args) else "success"
            return "success"

        runner.run = fake_run
        state = runner.capture_autosave_state()
        state["service"] = True
        runner.pause_autosave(state)
        errors = runner.restore_autosave(state)

        self.assertEqual(len(errors), 1)
        self.assertIn(("systemctl", "--user", "start", runner.AUTOSAVE_TIMER), commands)


if __name__ == "__main__":
    unittest.main()
