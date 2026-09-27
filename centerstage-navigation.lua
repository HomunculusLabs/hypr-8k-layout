-- Pure focus selection: no compositor operations and no mutation of snapshots.
local M = {}
local panels = {'left', 'center', 'right'}
local panel_tags = {
  ['centerstage-left']='left', ['centerstage-left-primary']='left',
  ['centerstage-left-secondary']='left', ['centerstage-center']='center',
  ['centerstage-right']='right',
}
function M.classify(w)
  local panel
  for _, tag in ipairs(w.tags or {}) do
    local candidate = panel_tags[tag]
    if candidate then
      if panel and panel ~= candidate then return nil end
      panel = candidate
    end
  end
  return panel
end
function M.eligible(w)
  return w and w.workspace and w.workspace >= 1 and w.workspace <= 3
    and w.mapped == true and w.accepts_input == true and not w.hidden
    and not w.pinned and not w.fullscreen and M.classify(w) ~= nil
    and w.content_type ~= 'game' and not (w.class or ''):match('^steam_app_')
end
local function recent(w)
  local n = w.focus_history_id
  return type(n) == 'number' and n >= 0 and n or math.huge
end
local function slot(w)
  if M.classify(w) ~= 'right' then return math.huge end
  local n = math.huge
  for _, tag in ipairs(w.tags or {}) do
    local value = tonumber(tag:match('^centerstage%-right%-([1-9]%d*)$'))
    if value and value < n then n = value end
  end
  return n
end
local function before(a, b)
  if slot(a) ~= slot(b) then return slot(a) < slot(b) end
  if a.y ~= b.y then return a.y < b.y end
  if a.x ~= b.x then return a.x < b.x end
  return a.id < b.id
end
function M.select(windows, source_id, direction)
  local source
  for _, w in ipairs(windows) do if w.id == source_id then source = w; break end end
  if not M.eligible(source) then return nil end
  local groups = {left={}, center={}, right={}}
  for _, w in ipairs(windows) do
    if M.eligible(w) and w.workspace == source.workspace and w.monitor == source.monitor then
      local group = groups[M.classify(w)]
      group[#group+1] = w
    end
  end
  local panel = M.classify(source)
  if direction == 'previous' then
    local chosen
    for _, choices in pairs(groups) do
      for _, w in ipairs(choices) do
        if w.id ~= source_id and recent(w) < math.huge
            and (not chosen or recent(w) < recent(chosen)
              or (recent(w) == recent(chosen) and before(w, chosen))) then
          chosen = w
        end
      end
    end
    return chosen and chosen.id or nil
  elseif direction == 'left' or direction == 'right' then
    local position
    for i, name in ipairs(panels) do if name == panel then position = i end end
    local step = direction == 'left' and -1 or 1
    for i = position + step, direction == 'left' and 1 or #panels, step do
      local choices = groups[panels[i]]
      table.sort(choices, function(a, b)
        if recent(a) ~= recent(b) then return recent(a) < recent(b) end
        return before(a, b)
      end)
      if choices[1] then return choices[1].id end
    end
  elseif direction == 'up' or direction == 'down' then
    local choices = groups[panel]
    if #choices < 2 then return nil end
    table.sort(choices, before)
    for i, w in ipairs(choices) do
      if w.id == source_id then
        local step = direction == 'up' and -1 or 1
        return choices[((i - 1 + step) % #choices) + 1].id
      end
    end
  end
end
return M
