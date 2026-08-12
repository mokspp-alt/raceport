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
  // Default alwaysOnTop level sits below AC's DirectX-rendered window even in
  // windowed mode — 'screen-saver' is the highest level Electron exposes and
  // is the only one that reliably draws over the game.
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
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
// Written by the TimerTrigger CSP Lua app (ac-plugin/TimerTrigger) the instant
// the player car's speed exceeds 0 — lets the timer start at the real moment
// driving begins instead of a fixed delay after launch.
const TIMER_MARKER_PATH = path.join(os.homedir(), 'Documents', 'Assetto Corsa', 'cfg', 'timer_start.marker')

// Opponent count for the AI grid — kiosk sessions are single-player-vs-AI,
// not time-limited (the kiosk's own timer kills acs.exe when the paid time
// runs out), so DURATION_MINUTES is set high and just never gets reached.
//
// SESSION_0 below uses TYPE=1 (Practice), not TYPE=3 (Race): a Race session's
// starting-light countdown reliably hangs (TTS computed as Infinity) under
// Wine/CrossOver, across every variant tried — grid or pit spawn, with or
// without a preceding Qualify, any Windows-version compat setting. Practice
// never hits that code path and still puts the AI cars on track. Needs
// re-testing on the real Windows kiosk, which has no translation layer.
const AI_OPPONENTS = 7

function writeRaceIni({ model, skin, track, trackConfig, driftMode }) {
  let opponents = ''
  for (let i = 1; i <= AI_OPPONENTS; i++) {
    opponents += `
[CAR_${i}]
MODEL=${model}
SKIN=
MODEL_CONFIG=
BALLAST=0
RESTRICTOR=0
AI_LEVEL=90
AI_AGGRESSION=50
`
  }

  const ini = `[RACE]
MODEL=${model}
SKIN=${skin || ''}
TRACK=${track}
CONFIG_TRACK=${trackConfig || ''}
AI_LEVEL=90
CARS=${AI_OPPONENTS + 1}
DRIFT_MODE=${driftMode || 0}
FIXED_SETUP=0
SOLO_RACE=0
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

[SESSION_0]
NAME=Practice
TYPE=1
DURATION_MINUTES=9999
SPAWN_SET=PIT

[CAR_0]
SETUP=
SKIN=${skin || ''}
MODEL=-
MODEL_CONFIG=
BALLAST=0
RESTRICTOR=0
DRIVER_NAME=RP1
NATIONALITY=Russia
NATION_CODE=RUS
${opponents}
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

// Ждём marker-файл от TimerTrigger (машина тронулась с места). Если плагин не
// установлен или почему-то не сработал — стартуем по таймауту, чтобы кассовая
// сессия не зависла молча.
let cancelDriveWatch = null

function watchForDriveStart(fallbackMs = 45000) {
  let done = false
  let watcher = null
  let fallbackTimer = null

  function trigger() {
    if (done) return
    done = true
    if (watcher) watcher.close()
    if (fallbackTimer) clearTimeout(fallbackTimer)
    cancelDriveWatch = null
    mainWindow?.hide()
    createOverlay()
    startTimer()
  }

  cancelDriveWatch = () => {
    if (done) return
    done = true
    if (watcher) watcher.close()
    if (fallbackTimer) clearTimeout(fallbackTimer)
    cancelDriveWatch = null
  }

  const markerDir = path.dirname(TIMER_MARKER_PATH)
  fs.mkdirSync(markerDir, { recursive: true })

  try {
    if (fs.existsSync(TIMER_MARKER_PATH)) fs.unlinkSync(TIMER_MARKER_PATH)
  } catch (err) {
    console.error('Failed to clear timer marker:', err)
  }

  try {
    watcher = fs.watch(markerDir, (eventType, filename) => {
      if (filename === path.basename(TIMER_MARKER_PATH) && fs.existsSync(TIMER_MARKER_PATH)) {
        trigger()
      }
    })
  } catch (err) {
    console.error('Failed to watch for timer marker:', err)
  }

  fallbackTimer = setTimeout(trigger, fallbackMs)
}

// acs.exe launched directly (no AssettoCorsa.exe menu first) always shows a
// "click the wheel icon to start driving" pit-lane prompt — confirmed this is
// not something race.ini or CSP config can skip: the Lua/Python app registry
// (where CSP's ac.disableQuickMenuPitstop() lives) only initializes inside
// AssettoCorsa.exe's own menu flow, which direct acs.exe launches bypass
// entirely. No config-only fix exists for this, so we click the icon
// ourselves via a raw Win32 SetCursorPos + mouse_event call (PowerShell,
// no extra native npm deps). Coordinates are for the kiosk's 1920x1080
// fullscreen output — verify/adjust DRIVE_BUTTON_X/Y on the real kiosk if
// the click lands off-target.
const DRIVE_BUTTON_X = 55
const DRIVE_BUTTON_Y = 165
const AC_LOG_PATH = path.join(os.homedir(), 'Documents', 'Assetto Corsa', 'logs', 'log.txt')
// Printed by acs.exe the instant the pit-lane camera fades in — i.e. loading
// is done and the wheel-icon prompt is now on screen. More reliable than a
// fixed delay, which either clicks too early (nothing there yet) or wastes
// time waiting past when the screen was already ready.
const LOAD_COMPLETE_MARKER = 'ACCameraManager::fadeIn'

function clickDriveButton() {
  const script = 'Add-Type -TypeDefinition \'using System;using System.Runtime.InteropServices;' +
    'public class RPMouse{[DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);' +
    '[DllImport("user32.dll")]public static extern void mouse_event(uint f,uint dx,uint dy,uint data,UIntPtr extra);}\'; ' +
    `[RPMouse]::SetCursorPos(${DRIVE_BUTTON_X},${DRIVE_BUTTON_Y}); Start-Sleep -Milliseconds 100; ` +
    '[RPMouse]::mouse_event(0x0002,0,0,0,[UIntPtr]::Zero); [RPMouse]::mouse_event(0x0004,0,0,0,[UIntPtr]::Zero)'

  exec(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`, (err, stdout, stderr) => {
    if (err) console.error('Drive-button click failed:', err, stderr)
  })
}

// Watches acs.exe's log for LOAD_COMPLETE_MARKER instead of guessing a fixed
// delay. Only looks at bytes written after this watch started, since log.txt
// accumulates across every session the kiosk runs, not just this one.
function watchForLoadComplete(callback, fallbackMs = 30000) {
  let done = false
  let watcher = null
  let fallbackTimer = null
  let startOffset = 0

  try {
    startOffset = fs.statSync(AC_LOG_PATH).size
  } catch {
    startOffset = 0
  }

  function finish() {
    if (done) return
    done = true
    if (watcher) watcher.close()
    if (fallbackTimer) clearTimeout(fallbackTimer)
    callback()
  }

  function checkForMarker() {
    try {
      const stat = fs.statSync(AC_LOG_PATH)
      if (stat.size <= startOffset) return
      const fd = fs.openSync(AC_LOG_PATH, 'r')
      const length = stat.size - startOffset
      const buffer = Buffer.alloc(length)
      fs.readSync(fd, buffer, 0, length, startOffset)
      fs.closeSync(fd)
      if (buffer.includes(LOAD_COMPLETE_MARKER)) finish()
    } catch (err) {
      console.error('Failed to read AC log for load-complete marker:', err)
    }
  }

  try {
    fs.mkdirSync(path.dirname(AC_LOG_PATH), { recursive: true })
    watcher = fs.watch(path.dirname(AC_LOG_PATH), (eventType, filename) => {
      if (filename === path.basename(AC_LOG_PATH)) checkForMarker()
    })
  } catch (err) {
    console.error('Failed to watch AC log for load-complete marker:', err)
  }

  fallbackTimer = setTimeout(finish, fallbackMs)
}

ipcMain.handle('launch-game', async (event, { steamAppId, carId, trackId, trackConfig, skin, driftMode, acExePath, durationSeconds }) => {
  try {
    remainingSeconds = durationSeconds
    warningShown = false

    if (carId && trackId) {
      writeRaceIni({ model: carId, skin, track: trackId, trackConfig, driftMode })
      const exePath = acExePath || AC_EXE_PATH
      exec(`"${exePath}"`, { cwd: path.dirname(exePath) }, (err, stdout, stderr) => {
        if (err) console.error('acs.exe launch failed:', err, stderr)
      })
      watchForLoadComplete(clickDriveButton)
    } else {
      await shell.openExternal(`steam://rungameid/${steamAppId}`)
    }

    watchForDriveStart()

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
  if (cancelDriveWatch) cancelDriveWatch()

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
