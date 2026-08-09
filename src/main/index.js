const { app, BrowserWindow, ipcMain, shell, globalShortcut, screen } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { exec } = require('child_process')
const db = require('./db')

const isDev = process.env.NODE_ENV === 'development'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'

let mainWindow
let overlayWindow = null
let timerInterval = null
let remainingSeconds = 0
let warningShown = false

// ─── Main window ─────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: !isDev,
    kiosk: !isDev,
    frame: false,
    autoHideMenuBar: true,
    resizable: false,
    alwaysOnTop: !isDev,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

// ─── Overlay window (timer поверх игры) ──────────────────────────────────────

function createOverlay() {
  if (overlayWindow) return

  const { width } = screen.getPrimaryDisplay().workAreaSize

  overlayWindow = new BrowserWindow({
    width: 220,
    height: 70,
    x: width - 240,
    y: 20,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  overlayWindow.loadFile(path.join(__dirname, 'overlay.html'))
  overlayWindow.setIgnoreMouseEvents(true)
  overlayWindow.on('closed', () => { overlayWindow = null })
}

function closeOverlay() {
  if (overlayWindow) {
    overlayWindow.close()
    overlayWindow = null
  }
}

app.whenReady().then(() => {
  createWindow()

  if (!isDev) {
    globalShortcut.register('CommandOrControl+Shift+A', () => {
      mainWindow?.webContents.send('open-admin')
    })
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── Game management ──────────────────────────────────────────────────────────

// acs.exe reads Documents\Assetto Corsa\cfg\race.ini on launch and jumps straight
// into that session — no menu, no clicks. Requires steam_appid.txt (containing
// 244210) next to acs.exe so Steam's DRM check passes without going through
// the Steam client. This replaces the old Content Manager --start=preset flow,
// which needed simulated clicks since the kiosk has no mouse/keyboard.
const AC_EXE_PATH = 'D:\\SteamLibrary\\steamapps\\common\\assettocorsa\\acs.exe'
const RACE_INI_PATH = path.join(os.homedir(), 'Documents', 'Assetto Corsa', 'cfg', 'race.ini')

function writeRaceIni({ model, skin, track, trackConfig, driftMode }) {
  const ini = `[RACE]
MODEL=${model}
SKIN=${skin || ''}
TRACK=${track}
CONFIG_TRACK=${trackConfig || ''}
AI_LEVEL=95
CARS=1
DRIFT_MODE=${driftMode || 0}
FIXED_SETUP=0
SOLO_RACE=1
RECORD_INPUTS=0
TELEPORT_CAR=0
MODEL_CONFIG=
PENALTIES=1
JUMP_START_PENALTY=0

[HEADER]
VERSION=2

[BENCHMARK]
ACTIVE=0

[REPLAY]
ACTIVE=0

[REMOTE]
ACTIVE=0

[RESTART]
ACTIVE=0

[OPTIONS]
USE_MPH=0

[LAP_INVALIDATOR]
ALLOWED_TYRES_OUT=-1

[CAR_0]
SKIN=${skin || ''}
MODEL_CONFIG=
BALLAST=0
RESTRICTOR=0
DRIVER_NAME=RP1
NATIONALITY=Russia
NATION_CODE=RUS

[GHOST_CAR]
RECORDING=0
PLAYING=0
LOAD=0
FILE=
ENABLED=0

[GROOVE]
VIRTUAL_LAPS=10
MAX_LAPS=30
STARTING_LAPS=0

[TEMPERATURE]
AMBIENT=26
ROAD=35

[WEATHER]
NAME=sol_01_clear

[WIND]
SPEED_KMH_MIN=0
SPEED_KMH_MAX=0
DIRECTION_DEG=11

[DYNAMIC_TRACK]
SESSION_START=100
RANDOMNESS=0
LAP_GAIN=1
SESSION_TRANSFER=100
`
  fs.mkdirSync(path.dirname(RACE_INI_PATH), { recursive: true })
  fs.writeFileSync(RACE_INI_PATH, ini)
}

ipcMain.handle('launch-game', async (event, { steamAppId, carId, trackId, trackConfig, skin, driftMode, acExePath, durationSeconds }) => {
  try {
    remainingSeconds = durationSeconds
    warningShown = false

    if (carId && trackId) {
      writeRaceIni({ model: carId, skin, track: trackId, trackConfig, driftMode })
      exec(`"${acExePath || AC_EXE_PATH}"`, () => {})
    } else {
      await shell.openExternal(`steam://rungameid/${steamAppId}`)
    }

    // Скрыть главное окно, показать оверлей поверх игры
    setTimeout(() => {
      mainWindow?.hide()
      createOverlay()
      startTimer()
    }, 8000)

    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('add-time', async (event, { additionalSeconds }) => {
  remainingSeconds += additionalSeconds
  warningShown = false
  return { success: true, remaining: remainingSeconds }
})

ipcMain.handle('close-game', async () => {
  stopGame()
  return { success: true }
})

ipcMain.handle('get-timer', () => remainingSeconds)

// ─── Timer ────────────────────────────────────────────────────────────────────

function startTimer() {
  if (timerInterval) clearInterval(timerInterval)

  timerInterval = setInterval(() => {
    remainingSeconds--

    // Тик → главное окно (для экрана GameRunning)
    mainWindow?.webContents.send('timer-tick', { remaining: remainingSeconds })
    // Тик → оверлей
    overlayWindow?.webContents.send('timer-tick', { remaining: remainingSeconds })

    if (remainingSeconds <= 300 && !warningShown) {
      warningShown = true
      mainWindow?.webContents.send('timer-warning', { remaining: remainingSeconds })
      // Показать главное окно для диалога продления
      mainWindow?.show()
      mainWindow?.focus()
    }

    if (remainingSeconds <= 0) {
      stopGame()
      mainWindow?.webContents.send('timer-expired')
      overlayWindow?.webContents.send('timer-expired')
    }
  }, 1000)
}

function stopGame() {
  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }
  remainingSeconds = 0
  closeOverlay()

  // Показать главное окно
  mainWindow?.show()
  mainWindow?.focus()

  // Закрыть игру
  if (process.platform === 'win32') {
    exec('taskkill /F /IM acs.exe /T', () => {})
    exec('taskkill /F /IM ac2-win64-shipping.exe /T', () => {})
  }
}

// ─── Database IPC ─────────────────────────────────────────────────────────────

ipcMain.handle('db-get-games', () => db.getActiveGames())
ipcMain.handle('db-get-all-games', () => db.getAllGames())
ipcMain.handle('db-add-game', (_, game) => db.addGame(game))
ipcMain.handle('db-update-game', (_, { id, updates }) => db.updateGame(id, updates))
ipcMain.handle('db-delete-game', (_, id) => db.deleteGame(id))
ipcMain.handle('db-create-session', (_, opts) => db.createSession(opts))
ipcMain.handle('db-finish-session', (_, id) => db.finishSession(id))
ipcMain.handle('db-record-transaction', (_, opts) => db.recordTransaction(opts))
ipcMain.handle('db-get-stats', (_, { from, to }) => db.getStats({ from, to }))

// ─── Admin ────────────────────────────────────────────────────────────────────

ipcMain.handle('admin-login', async (_, { password }) => ({
  success: password === ADMIN_PASSWORD,
}))

ipcMain.handle('admin-exit-kiosk', async () => {
  stopGame()
  app.quit()
})

ipcMain.handle('admin-restart', async () => {
  stopGame()
  app.relaunch()
  app.quit()
})

ipcMain.on('controller-action', (event, action) => {
  mainWindow?.webContents.send('controller-action', action)
})
