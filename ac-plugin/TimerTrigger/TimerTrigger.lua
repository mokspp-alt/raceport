-- Headless CSP Lua app (requires Custom Shaders Patch, Lua apps enabled).
-- On every session it waits until the player car actually starts moving,
-- then writes a marker file once. The kiosk Electron app watches this file
-- (see src/main/index.js) to know the exact moment driving begins, instead
-- of guessing with a fixed setTimeout after launch.

local triggered = false
local markerPath = ac.getFolder(ac.FolderID.Documents) .. '/Assetto Corsa/cfg/timer_start.marker'

function script.update(dt)
  if triggered then return end

  local car = ac.getCar(0)
  if car == nil then return end

  if car.speedKmh > 0.5 then
    triggered = true
    local f = io.open(markerPath, 'w')
    if f ~= nil then
      f:write(tostring(os.time()))
      f:close()
    end
  end
end
