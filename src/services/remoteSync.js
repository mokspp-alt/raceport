// Syncs local data to the central VPS server
// Kiosk works fully offline — sync is best-effort, never blocks the UI

const SERVER_URL = import.meta.env.VITE_SERVER_URL || ''
const API_SECRET = import.meta.env.VITE_API_SECRET || ''
const KIOSK_ID = import.meta.env.VITE_KIOSK_ID || 'kiosk-1'
const KIOSK_NAME = import.meta.env.VITE_KIOSK_NAME || 'Киоск 1'

function apiHeaders() {
  return { 'Content-Type': 'application/json', 'x-api-secret': API_SECRET }
}

// Called on app start — fetches remote game list and returns it (or null if offline)
export async function syncGamesFromServer() {
  if (!SERVER_URL) return null
  try {
    const r = await fetch(`${SERVER_URL}/api/kiosk/sync`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ kioskId: KIOSK_ID, kioskName: KIOSK_NAME }),
      signal: AbortSignal.timeout(5000),
    })
    if (!r.ok) return null
    const { games } = await r.json()
    return games
  } catch {
    return null // offline — use local DB
  }
}

// Called after each successful payment
export async function pushTransaction({ sessionId, paymentId, gameName, amountRub, durationMinutes, type }) {
  if (!SERVER_URL) return
  try {
    await fetch(`${SERVER_URL}/api/kiosk/transaction`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        kioskId: KIOSK_ID,
        localSessionId: sessionId,
        paymentId,
        gameName,
        amountRub,
        durationMinutes,
        type,
      }),
      signal: AbortSignal.timeout(8000),
    })
  } catch {
    // Silent fail — local SQLite has the data anyway
  }
}
