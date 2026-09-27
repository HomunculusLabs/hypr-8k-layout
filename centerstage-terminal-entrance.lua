-- Materialize new terminals after the asynchronous Centerstage placement.
-- No changes to their later movement, resizing, opacity, or focus behavior.
local M = {}

M.rule = {match={tag='cs-terminal-opening'}, no_anim=true, opacity='0 override 0 override'}

function M.install(api, options)
  options = options or {}
  local tag = 'cs-terminal-opening' -- not a Centerstage membership tag
  local classes = options.classes or {foot=true, ['org.codeberg.dnkl.foot']=true}
  local workspaces = options.workspaces or {[1]=true, [2]=true, [3]=true}
  local pending = {}

  local function roles(w)
    local zone, auxiliary = false, false
    for _, raw in ipairs(w.tags or {}) do
      local name = raw:gsub('%*$', '')
      if name == 'centerstage-center' or name == 'centerstage-right'
          or name == 'centerstage-left' or name == 'centerstage-left-primary'
          or name == 'centerstage-left-secondary' then zone = true end
      if name == 'centerstage-auxiliary' or name == 'centerstage-pinned' then auxiliary = true end
    end
    return zone, auxiliary
  end

  local function allowed(w)
    if not w or not w.mapped or w.hidden or w.pinned or w.fullscreen ~= 0
        or not w.workspace or not workspaces[w.workspace.id] then return false end
    local _, auxiliary = roles(w)
    return not auxiliary
  end

  local function remove_tag(w)
    for _, existing in ipairs(w.tags or {}) do
      if existing == tag then
        api.dispatch(api.dsp.window.tag({tag='-'..tag, window='address:'..w.address}))
        return
      end
    end
  end

  -- Reload cancels old timers. Recover only terminals this controller owns.
  for _, w in ipairs(api.get_windows()) do
    if classes[w.initial_class or w.class] then remove_tag(w) end
  end

  local function finish(state)
    if pending[state.address] ~= state then return end
    pending[state.address] = nil
    if state.poll then state.poll:set_enabled(false) end
    if state.deadline then state.deadline:set_enabled(false) end
    local w = api.get_window('address:'..state.address)
    if w and w.stable_id == state.id then remove_tag(w) end
  end

  local subscription = api.on('window.open', function(w)
    if not allowed(w) or not classes[w.initial_class or w.class] then return end
    local zone = roles(w)
    if zone or w.size.x < 600 or w.size.y < 400 then return end
    if not w.address:match('^0x%x+$') or not w.stable_id then return end
    local previous = pending[w.address]
    if previous then
      if previous.id == w.stable_id then return end
      finish(previous)
    end
    local state = {address=w.address, id=w.stable_id, workspace=w.workspace.id}
    pending[w.address] = state
    state.poll = api.timer(function()
      local current = api.get_window('address:'..state.address)
      if not current or current.stable_id ~= state.id or not allowed(current)
          or current.workspace.id ~= state.workspace then finish(state); return end
      local placed = roles(current)
      if placed and current.floating then
        local geometry = table.concat({current.at.x,current.at.y,current.size.x,current.size.y}, ':')
        -- Keep the window transparent and unanimated for another compositor
        -- frame after the transaction, so revealing it cannot show the travel.
        if state.geometry == geometry then finish(state) else state.geometry = geometry end
      else
        state.geometry = nil
      end
    end, {timeout=20, type='repeat'})
    -- Fail open if the external handler is stopped, slow, or rejects the window.
    state.deadline = api.timer(function() finish(state) end, {timeout=1000, type='oneshot'})
    api.dispatch(api.dsp.window.tag({tag='+'..tag, window='address:'..w.address}))
  end)

  return {stop=function()
    subscription:remove()
    local states = {}
    for _, state in pairs(pending) do states[#states+1] = state end
    for _, state in ipairs(states) do finish(state) end
  end}
end

return M
