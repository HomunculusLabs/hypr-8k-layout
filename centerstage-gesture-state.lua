-- Pure, one-shot swipe recognition. Hyprland sends the start delta again in update.
local State = {}
State.__index = State
function State.new(options)
  return setmetatable({options=options}, State)
end
function State:reset()
  self.active, self.direction, self.x, self.y = false, nil, 0, 0
end
function State:start(e)
  self:reset()
  self.active = e.type == 'swipe' and e.fingers == self.options.fingers
end
function State:update(e)
  if not self.active then return end
  if e.type ~= 'swipe' or e.fingers ~= self.options.fingers then self:reset(); return end
  self.x, self.y = self.x + e.delta.x, self.y + e.delta.y
  if not self.direction then
    local x, y = math.abs(self.x), math.abs(self.y)
    local ratio, distance = self.options.axis_ratio, self.options.lock_distance
    if x >= distance and x >= y * ratio then
      self.direction = self.x < 0 and 'left' or 'right'
    elseif y >= distance and y >= x * ratio then
      self.direction = self.y < 0 and 'up' or 'down'
    end
  end
end
function State:finish(e)
  local direction
  if self.active and e.type == 'swipe' and e.cancelled == false then
    local distances = {left=-self.x, right=self.x, up=-self.y, down=self.y}
    local horizontal = self.direction == 'left' or self.direction == 'right'
    local orthogonal = horizontal and math.abs(self.y) or math.abs(self.x)
    if self.direction and distances[self.direction] >= self.options.threshold
        and distances[self.direction] >= orthogonal * self.options.axis_ratio then
      direction = self.direction
    end
  end
  self:reset()
  return direction
end
return State
