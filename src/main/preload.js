const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('kiosk', {
  // Game
  launchGame: (opts) => ipcRenderer.invoke('launch-game', opts), // opts: { steamAppId, carId, trackId, trackConfig, acExePath, durationSeconds }
  addTime: (opts) => ipcRenderer.invoke('add-time', opts),
  closeGame: () => ipcRenderer.invoke('close-game'),
  getTimer: () => ipcRenderer.invoke('get-timer'),

  // Admin
  adminLogin: (opts) => ipcRenderer.invoke('admin-login', opts),
  exitKiosk: () => ipcRenderer.invoke('admin-exit-kiosk'),
  restartKiosk: () => ipcRenderer.invoke('admin-restart'),
  pickImage: () => ipcRenderer.invoke('admin-pick-image'),

  // Database
  db: {
    getGames: () => ipcRenderer.invoke('db-get-games'),
    getAllGames: () => ipcRenderer.invoke('db-get-all-games'),
    addGame: (game) => ipcRenderer.invoke('db-add-game', game),
    updateGame: (id, updates) => ipcRenderer.invoke('db-update-game', { id, updates }),
    deleteGame: (id) => ipcRenderer.invoke('db-delete-game', id),
    createSession: (opts) => ipcRenderer.invoke('db-create-session', opts),
    finishSession: (id) => ipcRenderer.invoke('db-finish-session', id),
    recordTransaction: (opts) => ipcRenderer.invoke('db-record-transaction', opts),
    getStats: (opts) => ipcRenderer.invoke('db-get-stats', opts),
  },

  // Events
  on: (channel, cb) => {
    const allowed = ['timer-tick', 'timer-warning', 'timer-expired', 'open-admin', 'controller-action']
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (_, ...args) => cb(...args))
    }
  },
  off: (channel, cb) => ipcRenderer.removeListener(channel, cb),
})
