import pathlib
import unittest


class WorkbenchBindings(unittest.TestCase):
    def test_run_once_and_stop_commands(self):
        source=(pathlib.Path(__file__).resolve().parents[1]/'bindings.lua').read_text()
        self.assertIn('o.bind("SUPER + CTRL + F8", "Macro Workbench: run once", workbench .. " --trigger")',source)
        self.assertIn('o.bind("SUPER + CTRL + F9", "Macro Workbench: stop", workbench .. " --stop")',source)


if __name__=='__main__':
    unittest.main()
