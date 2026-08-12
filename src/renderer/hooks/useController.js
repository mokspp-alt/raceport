import { useEffect } from 'react'

// PXN CB1 Control Box — maps buttons to navigation events
// The device shows as a standard HID gamepad in Windows
// We dispatch custom events so any screen can listen

// Confirmed on real hardware via the admin panel's Controller tab.
const BUTTON_MAP = {
  2: 'action',     // unconfirmed guess — not yet tested on this device
  3: 'admin',      // unconfirmed guess — long-press triggers admin, not yet tested
  8: 'back',       // эскейп
  9: 'confirm',    // энтер
}

// This device has no separate d-pad buttons — "назад"/"вперёд" report as
// a single hat-switch axis instead. Values confirmed on real hardware
// via the admin panel's Controller tab.
const HAT_AXIS_INDEX = 9
const HAT_EPSILON = 0.1
const HAT_DIRECTIONS = [
  [0.71, 'left'],   // назад — previous item
  [-0.43, 'right'], // вперёд — next item
]

function hatDirection(value) {
  if (value === undefined) return null
  for (const [angle, dir] of HAT_DIRECTIONS) {
    if (Math.abs(value - angle) < HAT_EPSILON) return dir
  }
  return null
}

// Every dispatched kiosk:* action also gets written to
// %TEMP%\raceport-controller.log, timestamped, so a run that behaves oddly
// on the real kiosk can be diagnosed from the log afterwards instead of
// only live on-screen.
//
// DEBOUNCE_MS: real hardware bounces — a single physical press/rocker-tilt
// flips the raw pressed/axis state back and forth for ~100-300ms, and each
// flip is a legitimate edge as far as the edge-detection below is
// concerned, so without this a single press fired the same action a dozen
// times (confirmed via raceport-controller.log: bursts of identical
// dispatches a few ms apart, matching a high-refresh-rate poll loop riding
// the bounce). Ignoring repeats of the same action within this window
// collapses each burst back down to one.
const DEBOUNCE_MS = 200
const lastFired = {}

function fireAction(action, detail) {
  const now = Date.now()
  if (lastFired[action] && now - lastFired[action] < DEBOUNCE_MS) return
  lastFired[action] = now

  window.dispatchEvent(new CustomEvent(`kiosk:${action}`))
  window.kiosk?.logController(`kiosk:${action} (${detail})`)
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
            fireAction('admin', `button ${index} held`)
            window.kiosk?.on('open-admin', () => {})
          }, 3000)
        } else {
          fireAction(action, `button ${index}`)
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

    const axisValue = gp.axes[HAT_AXIS_INDEX]
    const direction = hatDirection(axisValue)
    if (direction && direction !== lastHatDirection) {
      fireAction(direction, `axis ${HAT_AXIS_INDEX}=${axisValue?.toFixed(2)}`)
    }
    lastHatDirection = direction
  }

  requestAnimationFrame(pollGamepad)
}

let pollingStarted = false

// Keyboard fallback for the same kiosk:* navigation events — there was no
// keyboard handling at all before this, only the Gamepad API poll below,
// so nothing reacted to arrow keys / Enter / Escape regardless of whether
// a controller was plugged in. Also serves as a hidden staff input method
// in production, same idea as the PXN CB1 mapping.
const KEY_MAP = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'confirm',
  Escape: 'back',
}

function onKeyDown(e) {
  // Don't hijack typing in the admin panel's text/password fields.
  const tag = e.target?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return

  const action = KEY_MAP[e.key]
  if (action) fireAction(action, `key ${e.key}`)
}

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

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
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
