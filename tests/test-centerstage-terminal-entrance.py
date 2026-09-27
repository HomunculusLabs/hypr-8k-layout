#!/usr/bin/env python3
"""Exercise the entrance controller using an isolated Lua compositor fixture."""
import json
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
HARNESS = r'''
local windows, events, timers, rules, calls = {}, {}, {}, {}, {}
local api = {dsp = {window = {tag = function(t) return t end}}}
function api.get_windows() local r={} for _,w in pairs(windows) do r[#r+1]=w end return r end
function api.get_window(selector) return windows[selector:sub(9)] end
function api.window_rule(rule)
  rules[#rules+1]=rule
  return {set_enabled=function(_,enabled) rule.enabled=enabled end}
end
function api.on(event, callback)
  events[event]=callback
  return {remove=function() events[event]=nil end}
end
function api.timer(callback, options)
  local timer={callback=callback, options=options, enabled=true}
  function timer:set_enabled(value) self.enabled=value end
  timers[#timers+1]=timer
  return timer
end
function api.dispatch(command)
  assert(command.tag and command.window, 'entrance controller must never move, resize or focus windows')
  calls[#calls+1]=command
  local w=api.get_window(command.window)
  if not w then return end
  local name=command.tag:sub(2)
  if command.tag:sub(1,1)=='+' then w.tags[#w.tags+1]=name
  else for i=#w.tags,1,-1 do if w.tags[i]==name then table.remove(w.tags,i) end end end
end
local function contains(w,tag) for _,t in ipairs(w.tags) do if t==tag then return true end end return false end
local function window(overrides)
  local w={address='0xa1', stable_id=1, class='foot', initial_class='foot', mapped=true, hidden=false,
    pinned=false, fullscreen=0, floating=false, workspace={id=1}, tags={'terminal*'},
    at={x=2800,y=100}, size={x=1000,y=700}}
  for k,v in pairs(overrides or {}) do w[k]=v end
  windows[w.address]=w
  return w
end
local function tick()
  local active={} for _,t in ipairs(timers) do if t.enabled and t.options.type=='repeat' then active[#active+1]=t end end
  for _,t in ipairs(active) do t.callback() end
end
local function timeout()
  for _,t in ipairs(timers) do if t.enabled and t.options.type=='oneshot' then t.callback() end end
end
local function no_timers() for _,t in ipairs(timers) do assert(not t.enabled, 'timer leaked') end end
local module=dofile(MODULE_PATH)
local pending='cs-terminal-opening'
'''


class TerminalEntranceTest(unittest.TestCase):
    def run_lua(self, body):
        module = ROOT / "centerstage-terminal-entrance.lua"
        self.assertTrue(module.exists(), "terminal entrance controller is missing")
        script = "local MODULE_PATH=" + json.dumps(str(module)) + "\n" + HARNESS + body
        result = subprocess.run(["lua", "-"], input=script, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_terminal_is_revealed_only_after_settled_zone_placement(self):
        self.run_lua(r'''
local rule=api.window_rule(module.rule)
local controller=module.install(api)
local w=window()
events['window.open'](w)
assert(contains(w,pending), 'new terminal was visible at its provisional center position')
assert(rules[1]==module.rule and rules[1].match.tag==pending and rules[1].no_anim==true)
assert(rules[1].opacity=='0 override 0 override', 'both focused and unfocused entrance must be invisible')
tick(); assert(contains(w,pending), 'revealed before handler assigned a zone')
w.tags[#w.tags+1]='centerstage-right'; w.floating=true; w.at={x=6000,y=100}; w.size={x=800,y=600}
tick(); assert(contains(w,pending), 'allow a compositor frame to warp to final geometry')
tick(); assert(not contains(w,pending), 'settled terminal never materialized')
assert(w.at.x==6000 and w.size.x==800)
no_timers()
controller.stop()
''')
    def test_installing_a_controller_does_not_reconfigure_global_window_rules(self):
        self.run_lua(r'''
local rule=api.window_rule(module.rule)
local c=module.install(api)
assert(#rules==1 and rules[1]==module.rule, 'the pure fixture must own the static presentation rule')
c.stop(); assert(#rules==1 and rules[1]==module.rule and rules[1].enabled~=false)
''')

    def test_a_probe_controller_does_not_clear_another_controllers_pending_terminal(self):
        self.run_lua(r'''
local real=window({tags={pending}})
local c=module.install(api, {classes={probe=true},workspaces={[99]=true}})
assert(contains(real,pending), 'installing a scoped controller changed another controller\'s terminal')
c.stop()
''')

    def test_replacement_open_at_a_reused_address_is_tracked_immediately(self):
        self.run_lua(r'''
local c=module.install(api); local first=window(); events['window.open'](first)
local old_poll,old_deadline=timers[1],timers[2]
local replacement=window({stable_id=2,tags={'terminal*'}})
events['window.open'](replacement)
assert(contains(replacement,pending), 'replacement bypassed its entrance before stale poll ran')
assert(not old_poll.enabled and not old_deadline.enabled, 'stale timers survived address reuse')
replacement.tags[#replacement.tags+1]='centerstage-right'; replacement.floating=true
tick(); tick(); assert(not contains(replacement,pending)); no_timers(); c.stop()
''')

    def test_controller_is_loaded_by_the_active_configuration(self):
        config = (ROOT / 'hyprland.lua').read_text()
        self.assertIn('if terminal_entrance.rule then hl.window_rule(terminal_entrance.rule) end', config)
        self.assertIn('terminal_entrance.install(hl)', config)

    def test_handler_accepts_the_non_membership_entrance_tag(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location('entrance_handler_fixture', ROOT / 'tests/test-centerstage-handler.py')
        assert spec is not None and spec.loader is not None
        fixture = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(fixture)
        case = fixture.HandlerTest('test_open_avoids_repeated_client_queries_for_zone_counts')
        try:
            case.setUp()
            parent = fixture.client('0xa1', zone='center')
            terminal = fixture.client('0xa2', tags=['terminal*', 'cs-terminal-opening'], floating=False)
            case.seed([parent, terminal])
            case.set_events('openwindow>>a2,1,foot,foot\n')
            case.run_script('centerstage-handler.sh')
            after = json.loads(case.clients.read_text())
            self.assertEqual(after[0], parent)
            self.assertIn('centerstage-right', after[1]['tags'])
            self.assertTrue(after[1]['floating'])
        finally:
            case.doCleanups()

    def test_no_assignment_reveals_the_window_with_a_bounded_fallback(self):
        self.run_lua(r'''
local controller=module.install(api); local w=window(); events['window.open'](w)
assert(contains(w,pending))
for _,t in ipairs(timers) do assert(t.options.timeout<=1000) end
timeout(); assert(not contains(w,pending), 'no assignment stranded an invisible terminal'); no_timers()
controller.stop()
''')

    def test_geometry_must_settle_before_reveal(self):
        self.run_lua(r'''
local controller=module.install(api); local w=window(); events['window.open'](w)
w.tags[#w.tags+1]='centerstage-right'; w.floating=true
tick(); w.at.x=6100; tick(); assert(contains(w,pending), 'revealed while geometry was still changing')
tick(); assert(not contains(w,pending)); no_timers(); controller.stop()
''')

    def test_other_apps_workspaces_and_auxiliaries_are_not_delayed(self):
        for overrides in (
            "{class='brave-browser',initial_class='brave-browser'}",
            "{workspace={id=4}}", "{tags={'centerstage-auxiliary*'}}",
            "{tags={'centerstage-right'}}", "{fullscreen=2}", "{pinned=true}",
            "{size={x=400,y=300}}",
        ):
            with self.subTest(overrides=overrides):
                self.run_lua("local c=module.install(api); local w=window(" + overrides + "); "
                             "events['window.open'](w); assert(not contains(w,pending)); "
                             "assert(#calls==0); no_timers(); c.stop()")

    def test_workspace_change_reveals_immediately(self):
        self.run_lua(r'''
local c=module.install(api); local w=window(); events['window.open'](w)
w.workspace={id=2}; tick(); assert(not contains(w,pending)); no_timers(); c.stop()
''')

    def test_closed_or_reused_window_does_not_leak_timers_or_touch_replacement(self):
        self.run_lua(r'''
local c=module.install(api); local w=window(); events['window.open'](w)
local replacement=window({stable_id=2,tags={}}); local before=#calls
tick(); assert(#calls==before, 'address reuse touched another window'); no_timers(); c.stop()
''')
        self.run_lua(r'''
local c=module.install(api); local w=window(); events['window.open'](w)
windows[w.address]=nil; tick(); no_timers(); c.stop()
''')

    def test_reload_and_shutdown_recover_pending_windows(self):
        self.run_lua(r'''
local rule=api.window_rule(module.rule)
local stale=window({tags={pending}}); local c=module.install(api)
assert(not contains(stale,pending), 'reload left a stale invisible terminal')
events['window.open'](stale); assert(contains(stale,pending)); c.stop()
assert(not contains(stale,pending)); assert(events['window.open']==nil)
assert(rules[1]==module.rule); no_timers()
''')

    def test_auxiliary_classification_releases_the_terminal(self):
        self.run_lua(r'''
local c=module.install(api); local w=window(); events['window.open'](w)
w.tags[#w.tags+1]='centerstage-auxiliary'; tick()
assert(not contains(w,pending)); no_timers(); c.stop()
''')


if __name__ == '__main__':
    unittest.main()
