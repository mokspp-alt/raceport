// Renderer-side DB service — proxies all calls to main process via IPC
// No network, no cloud — data lives in kiosk.db (SQLite) on the machine

// window.kiosk is only injected by the Electron preload script — when the
// renderer is opened directly in a browser (e.g. for UI-only work), calls
// reject instead of throwing so existing .catch() fallbacks still run.
const call = (method, ...args) => {
  const db = window.kiosk?.db
  if (!db) return Promise.reject(new Error(`kiosk db unavailable: ${method}`))
  return db[method](...args)
}

export const getActiveGames = () => call('getGames')
export const getAllGames = () => call('getAllGames')
export const addGame = (game) => call('addGame', game)
export const updateGame = (id, updates) => call('updateGame', id, updates)
export const deleteGame = (id) => call('deleteGame', id)
export const createSession = (opts) => call('createSession', opts)
export const finishSession = (id) => call('finishSession', id)
export const recordTransaction = (opts) => call('recordTransaction', opts)
export const getStats = (opts) => call('getStats', opts)
