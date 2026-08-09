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

let adminHoldTimer = null
let lastButtons = {}

function pollGamepad() {
  const gamepads = navigator.getGamepads()
  for (const gp of gamepads) {
    if (!gp) continue

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

    // Analog stick → navigation
    const axisX = gp.axes[0]
    const axisY = gp.axes[1]
    if (Math.abs(axisX) > 0.7 || Math.abs(axisY) > 0.7) {
      // Debounce analog
    }
  }

  requestAnimationFrame(pollGamepad)
}

export default function useController() {
  useEffect(() => {
    window.addEventListener('gamepadconnected', () => {
      requestAnimationFrame(pollGamepad)
    })

    // If gamepad already connected
    if (navigator.getGamepads().some(Boolean)) {
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
