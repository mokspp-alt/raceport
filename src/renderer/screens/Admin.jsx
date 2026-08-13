import { useState, useEffect, useRef } from 'react'
import { getAllGames, addGame, updateGame, deleteGame, getStats } from '../../services/db'
import KioskButton from '../components/KioskButton'

export default function Admin({ onClose }) {
  const [stage, setStage] = useState('login') // login | panel
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [tab, setTab] = useState('games')
  const [games, setGames] = useState([])
  const [stats, setStats] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (stage === 'login') inputRef.current?.focus()
    if (stage === 'panel') {
      loadGames()
      loadStats()
    }
  }, [stage])

  async function handleLogin(e) {
    e?.preventDefault()
    const result = await window.kiosk?.adminLogin({ password })
    if (result?.success) {
      setStage('panel')
      setError('')
    } else {
      setError('Неверный пароль')
      setPassword('')
    }
  }

  async function loadGames() {
    const data = await getAllGames().catch(() => [])
    setGames(data)
  }

  async function loadStats() {
    const to = new Date().toISOString()
    const from = new Date(Date.now() - 30 * 24 * 3600000).toISOString()
    const data = await getStats({ from, to }).catch(() => [])
    const total = data.reduce((sum, t) => sum + t.amount_rub, 0)
    const count = data.length
    setStats({ total, count, transactions: data })
  }

  if (stage === 'login') {
    return (
      <Overlay>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2rem',
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: 'white',
            marginBottom: '2rem',
          }}>
            🔒 Администратор
          </div>
          <form onSubmit={handleLogin}>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Пароль"
              style={{
                width: '100%',
                padding: '1rem',
                fontSize: '1.2rem',
                fontFamily: 'var(--font-display)',
                background: '#1c1c22',
                border: `2px solid ${error ? '#e63946' : 'rgba(136,136,171,0.48)'}`,
                borderRadius: 16,
                color: 'white',
                outline: 'none',
                textAlign: 'center',
                letterSpacing: '0.3em',
                cursor: 'text',
                marginBottom: '1.5rem',
              }}
            />
            {error && <div style={{ color: '#e63946', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <KioskButton variant="secondary" keycap="esc" onClick={onClose}>отмена</KioskButton>
              <KioskButton type="submit" variant="primary" keycap="enter">войти</KioskButton>
            </div>
          </form>
        </div>
      </Overlay>
    )
  }

  return (
    <Overlay>
      <div style={{ width: '90vw', maxWidth: 1200, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem' }}>⚙️ Панель управления</div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn btn-secondary" onClick={() => window.kiosk?.restartKiosk()} style={{ fontSize: '0.9rem', padding: '0.6rem 1.2rem' }}>
              🔄 Перезапуск
            </button>
            <button className="btn btn-primary" style={{ fontSize: '0.9rem', padding: '0.6rem 1.2rem', background: '#c0392b' }}
              onClick={() => window.kiosk?.exitKiosk()}>
              ⏻ Выход
            </button>
            <button className="btn btn-secondary" onClick={onClose} style={{ fontSize: '0.9rem', padding: '0.6rem 1.2rem' }}>
              ✕ Закрыть
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--card-border)', paddingBottom: '0.5rem' }}>
          {['games', 'stats'].map(t => (
            <button
              key={t}
              className={`btn ${tab === t ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setTab(t)}
              style={{ fontSize: '0.9rem', padding: '0.5rem 1.5rem' }}
            >
              {t === 'games' ? '🎮 Игры' : '📊 Статистика'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {tab === 'games' && <GamesTab games={games} onRefresh={loadGames} />}
          {tab === 'stats' && <StatsTab stats={stats} />}
        </div>
      </div>
    </Overlay>
  )
}

function GamesTab({ games, onRefresh }) {
  const [editGame, setEditGame] = useState(null)
  const [newGame, setNewGame] = useState(false)

  async function handleSave(game) {
    if (game.id) {
      await updateGame(game.id, game)
    } else {
      await addGame(game)
    }
    setEditGame(null)
    setNewGame(false)
    onRefresh()
  }

  async function handleDelete(id) {
    if (!confirm('Удалить игру?')) return
    await deleteGame(id)
    onRefresh()
  }

  async function handleToggle(game) {
    await updateGame(game.id, { active: !game.active })
    onRefresh()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button className="btn btn-primary" onClick={() => setNewGame(true)} style={{ fontSize: '0.9rem' }}>
          + Добавить игру
        </button>
      </div>

      {(newGame || editGame) && (
        <GameForm
          game={editGame || {}}
          onSave={handleSave}
          onCancel={() => { setEditGame(null); setNewGame(false) }}
        />
      )}

      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {games.map(game => (
          <div key={game.id} className="card" style={{ display: 'flex', alignItems: 'center', padding: '1rem 1.5rem', gap: '1rem' }}>
            <span style={{ fontSize: '1.5rem' }}>{game.emoji || '🎮'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{game.name}</div>
              <div style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>
                Steam ID: {game.steam_app_id} · {game.price_per_hour} ₽/час
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ color: game.active ? '#4caf50' : 'var(--text2)', fontSize: '0.85rem' }}>
                {game.active ? '● Активна' : '○ Скрыта'}
              </span>
              <button className="btn btn-secondary" onClick={() => handleToggle(game)} style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}>
                {game.active ? 'Скрыть' : 'Показать'}
              </button>
              <button className="btn btn-secondary" onClick={() => setEditGame(game)} style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}>
                ✏️
              </button>
              <button onClick={() => handleDelete(game.id)} style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', background: 'transparent', border: '1px solid #c0392b', color: '#e74c3c', borderRadius: 6, cursor: 'pointer' }}>
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function GameForm({ game, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: '', steam_app_id: '', price_per_hour: 150, emoji: '🎮', image_url: '', car_id: '', track_id: '', track_config: '', ac_exe_path: '', active: true,
    ...game,
  })

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div className="card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
      <div style={{ fontWeight: 700, marginBottom: '1rem' }}>{game.id ? 'Редактировать' : 'Новая игра'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
        <Field label="Название" value={form.name} onChange={set('name')} />
        <Field label="Steam App ID" value={form.steam_app_id} onChange={set('steam_app_id')} />
        <Field label="Цена ₽/час" value={form.price_per_hour} onChange={set('price_per_hour')} type="number" />
        <Field label="Emoji" value={form.emoji} onChange={set('emoji')} />
        <Field label="URL обложки" value={form.image_url} onChange={set('image_url')} style={{ gridColumn: 'span 2' }} />
        <Field label="Car ID (для AC)" value={form.car_id} onChange={set('car_id')} placeholder="ferrari_f138" />
        <Field label="Track ID (для AC)" value={form.track_id} onChange={set('track_id')} placeholder="monza" />
        <Field label="Track Config" value={form.track_config} onChange={set('track_config')} placeholder="(пусто = основная)" />
        <Field label="Путь к acs.exe (если не стандартный)" value={form.ac_exe_path} onChange={set('ac_exe_path')} style={{ gridColumn: 'span 3' }} placeholder="C:\...Steam\steamapps\common\assettocorsa\acs.exe" />
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary" onClick={onCancel}>Отмена</button>
        <button className="btn btn-primary" onClick={() => onSave(form)}>Сохранить</button>
      </div>
    </div>
  )
}

function Field({ label, style, ...props }) {
  return (
    <div style={style}>
      <label style={{ display: 'block', color: 'var(--text2)', fontSize: '0.8rem', marginBottom: 4 }}>{label}</label>
      <input
        {...props}
        style={{
          width: '100%', padding: '0.6rem', background: 'var(--bg2)',
          border: '1px solid var(--card-border)', borderRadius: 6, color: 'white',
          fontSize: '0.95rem', outline: 'none', cursor: 'text',
        }}
      />
    </div>
  )
}

function StatsTab({ stats }) {
  if (!stats) return <div style={{ color: 'var(--text2)' }}>Загрузка...</div>
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
        <StatCard label="Доход за 30 дней" value={`${stats.total} ₽`} />
        <StatCard label="Транзакций" value={stats.count} />
      </div>
      <div style={{ fontWeight: 700, marginBottom: '0.75rem' }}>Последние операции</div>
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {stats.transactions.slice(0, 20).map(t => (
          <div key={t.id} className="card" style={{ padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>
              {new Date(t.created_at).toLocaleString('ru')} · {t.type === 'extension' ? '⏱ Продление' : '🎮 Сессия'}
            </span>
            <span style={{ fontWeight: 700 }}>{t.amount_rub} ₽</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="card" style={{ padding: '1.5rem', textAlign: 'center' }}>
      <div style={{ color: 'var(--text2)', fontSize: '0.9rem', marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 700, color: '#ffe100' }}>
        {value}
      </div>
    </div>
  )
}

function Overlay({ children }) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.92)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9000,
      animation: 'fadeIn 0.2s ease',
    }}>
      <div className="card" style={{ padding: '2rem', maxWidth: '95vw', fontFamily: 'var(--font-display)' }}>
        {children}
      </div>
    </div>
  )
}
