const Store = require('electron-store')

const store = new Store({
  name: 'kiosk-data',
  defaults: {
    games: [
      { id: 1, name: 'drift',       steam_app_id: '244210', car_id: 'bmw_m3_e92_drift',    track_id: 'shuto_revival_project_beta', track_config: '', ac_exe_path: '', price_per_hour: 150, emoji: '💨', image_url: '', color: '#1a1a2a', active: 1, display_order: 1 },
      { id: 2, name: 'shashki',     steam_app_id: '244210', car_id: 'hsrc_mby_rx8_scarlet', skin: '00_velocity_red', track_id: 'horizon_life_moscow', track_config: '', drift_mode: 0, ac_exe_path: '', price_per_hour: 150, emoji: '🏁', image_url: '', color: '#1a1a2a', active: 1, display_order: 2 },
      { id: 4, name: 'gt3',         steam_app_id: '244210', car_id: 'ks_porsche_911_gt3_r', track_id: 'ks_barcelona',             track_config: '', ac_exe_path: '', price_per_hour: 200, emoji: '🏆', image_url: '', color: '#2a1a0a', active: 1, display_order: 4 },
      { id: 5, name: 'f1',          steam_app_id: '244210', car_id: 'rss_formula_hybrid_2020', track_id: 'monza',                 track_config: '', ac_exe_path: '', price_per_hour: 250, emoji: '🏎️', image_url: '', color: '#c0392b', active: 1, display_order: 5 },
    ],
    sessions: [],
    transactions: [],
    _nextId: { games: 6, sessions: 1, transactions: 1 },
  },
})

function nextId(table) {
  const ids = store.get('_nextId')
  const id = ids[table]
  store.set('_nextId', { ...ids, [table]: id + 1 })
  return id
}

function now() {
  return new Date().toISOString()
}

// ─── Games ────────────────────────────────────────────────────────────────────

function getActiveGames() {
  return store.get('games')
    .filter(g => g.active)
    .sort((a, b) => a.display_order - b.display_order)
}

function getAllGames() {
  return store.get('games').sort((a, b) => a.display_order - b.display_order)
}

function addGame(game) {
  const games = store.get('games')
  const newGame = { ...game, id: nextId('games'), active: 1 }
  store.set('games', [...games, newGame])
  return newGame
}

function updateGame(id, updates) {
  const games = store.get('games').map(g => g.id === id ? { ...g, ...updates } : g)
  store.set('games', games)
  return games.find(g => g.id === id)
}

function deleteGame(id) {
  store.set('games', store.get('games').filter(g => g.id !== id))
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

function createSession({ gameId, paymentId, durationMinutes, amountRub }) {
  const session = {
    id: nextId('sessions'),
    game_id: gameId,
    payment_id: paymentId,
    duration_minutes: durationMinutes,
    amount_rub: amountRub,
    status: 'active',
    started_at: now(),
    finished_at: null,
    created_at: now(),
  }
  store.set('sessions', [...store.get('sessions'), session])
  return session
}

function finishSession(id) {
  const sessions = store.get('sessions').map(s =>
    s.id === id ? { ...s, status: 'finished', finished_at: now() } : s
  )
  store.set('sessions', sessions)
}

// ─── Transactions ─────────────────────────────────────────────────────────────

function recordTransaction({ sessionId, paymentId, amountRub, type }) {
  const tx = {
    id: nextId('transactions'),
    session_id: sessionId,
    payment_id: paymentId,
    amount_rub: amountRub,
    type: type || 'initial',
    created_at: now(),
  }
  store.set('transactions', [...store.get('transactions'), tx])
  return tx
}

function getStats({ from, to }) {
  const games = store.get('games')
  const sessions = store.get('sessions')

  return store.get('transactions')
    .filter(t => t.created_at >= from && t.created_at <= to)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(t => {
      const session = sessions.find(s => s.id === t.session_id)
      const game = games.find(g => g.id === session?.game_id)
      return { ...t, game_name: game?.name }
    })
}

module.exports = {
  getActiveGames, getAllGames, addGame, updateGame, deleteGame,
  createSession, finishSession, recordTransaction, getStats,
}
