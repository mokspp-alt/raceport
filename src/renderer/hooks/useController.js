import { useEffect } from 'react'

// PXN CB1 Control Box — maps buttons to navigation events
// The device shows as a standard HID gamepad in Windows
// We dispatch custom events so any screen can listen

const BUTTON_MAP = {
  0: 'confirm',    // A / Button 1
  1: 'back',       // B / Button 2
  2: 'action',     // X / Button 3
  3: 'admin',      // Y / Button 4 (long-press triggers admin)
  12: 'up',        // D-pad up
  13: 'down',      // D-pad down
  14: 'left',      // D-pad left
  15: 'right',     // D-pad right
}

// Fallback for controllers that report the d-pad as a hat-switch axis
// instead of four buttons (common on devices Chromium doesn't recognize
// with the "standard" gamepad mapping — button/axis indices then come
// through raw instead of remapped to 12-15). Value is centered at -1 and
// otherwise one of 8 compass points evenly spaced across [-1, 1]; only the
// four cardinal ones matter here.
const HAT_AXIS_INDEX = 9
const HAT_EPSILON = 0.1
const HAT_DIRECTIONS = [
  [-1, 'up'],
  [-1 / 7, 'right'],
  [3 / 7, 'down'],
  [1, 'left'],
]

function hatDirection(value) {
  if (value === undefined) return null
  for (const [angle, dir] of HAT_DIRECTIONS) {
    if (Math.abs(value - angle) < HAT_EPSILON) return dir
  }
  return null
}

let adminHoldTimer = null
let lastButtons = {}
let lastHatDirection = null
let lastLoggedState = ''

function pollGamepad() {
  const gamepads = navigator.getGamepads()
  for (const gp of gamepads) {
    if (!gp) continue

    // Dumps raw button/axis state to the console on every change — lets the
    // indices for an unfamiliar controller be read straight off devtools on
    // the kiosk instead of guessing blind from logs collected remotely.
    const stateKey = `${gp.buttons.map((b) => (b.pressed ? 1 : 0)).join('')}|${gp.axes.map((a) => a.toFixed(2)).join(',')}`
    if (stateKey !== lastLoggedState) {
      lastLoggedState = stateKey
      console.log(`[controller] ${gp.id}`, stateKey)
    }

    gp.buttons.forEach((btn, index) => {
      const action = BUTTON_MAP[index]
      if (!action) return

      const wasPressed = lastButtons[index] || false
      const isPressed = btn.pressed

      if (isPressed && !wasPressed) {
        // Button just pressed
        if (action === 'admin') {
          adminHoldTimer = setTimeout(() => {
            window.dispatchEvent(new CustomEvent('kiosk:admin'))
            window.kiosk?.on('open-admin', () => {})
          }, 3000)
        } else {
          window.dispatchEvent(new CustomEvent(`kiosk:${action}`))
        }
      }

      if (!isPressed && wasPressed) {
        // Button released
        if (action === 'admin' && adminHoldTimer) {
          clearTimeout(adminHoldTimer)
          adminHoldTimer = null
        }
      }

      lastButtons[index] = isPressed
    })

    const direction = hatDirection(gp.axes[HAT_AXIS_INDEX])
    if (direction && direction !== lastHatDirection) {
      window.dispatchEvent(new CustomEvent(`kiosk:${direction}`))
    }
    lastHatDirection = direction
  }

  requestAnimationFrame(pollGamepad)
}

let pollingStarted = false

export default function useController() {
  useEffect(() => {
    // Chromium only exposes gamepads that were already connected once the
    // page has seen some interaction with them, so 'gamepadconnected' can
    // arrive late or (for some devices) not at all. Starting the poll loop
    // unconditionally on mount means the very next frame after the browser
    // does expose the controller picks it up either way, instead of the
    // loop never starting at all.
    if (!pollingStarted) {
      pollingStarted = true
      requestAnimationFrame(pollGamepad)
    }

    return () => {}
  }, [])
}

// Hook for individual screens to listen to controller events
export function useControllerEvent(action, handler) {
  useEffect(() => {
    const key = `kiosk:${action}`
    window.addEventListener(key, handler)
    return () => window.removeEventListener(key, handler)
  }, [action, handler])
}
