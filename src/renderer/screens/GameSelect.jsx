import { useState, useEffect, useCallback } from 'react'
import { getActiveGames } from '../../services/db'
import { syncGamesFromServer } from '../../services/remoteSync'
import { useControllerEvent } from '../hooks/useController'

export default function GameSelect({ onSelect }) {
  const [games, setGames] = useState([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      // Try remote first, fall back to local SQLite, then demo data
      const remote = await syncGamesFromServer()
      if (remote?.length) { setGames(remote); setLoading(false); return }
      getActiveGames()
        .then(local => setGames(local?.length ? local : DEMO_GAMES))
        .catch(() => setGames(DEMO_GAMES))
        .finally(() => setLoading(false))
    }
    load()
  }, [])

  const moveLeft = useCallback(() => {
    setSelectedIndex(i => (i - 1 + games.length) % games.length)
  }, [games.length])

  const moveRight = useCallback(() => {
    setSelectedIndex(i => (i + 1) % games.length)
  }, [games.length])

  const confirm = useCallback(() => {
    if (games[selectedIndex]) onSelect(games[selectedIndex])
  }, [games, selectedIndex, onSelect])

  useControllerEvent('left', moveLeft)
  useControllerEvent('right', moveRight)
  useControllerEvent('up', moveLeft)
  useControllerEvent('down', moveRight)
  useControllerEvent('confirm', confirm)

  if (loading) return <LoadingScreen />

  return (
    <div className="screen" style={{ background: 'radial-gradient(ellipse at center, #1a0a1f 0%, #0a0a0f 70%)' }}>
      <div className="fade-in" style={{ textAlign: 'center' }}>
        <div className="screen-title">Выберите игру</div>
        <div className="screen-subtitle">◄ ► для выбора · A для запуска</div>

        <div style={{ position: 'relative', height: 318, marginTop: '2rem' }}>
          {games.map((game, i) => {
            const offset = i - selectedIndex
            const isSelected = offset === 0
            const scale = isSelected ? 1 : Math.abs(offset) === 1 ? 0.85 : 0.7
            const opacity = isSelected ? 1 : Math.abs(offset) === 1 ? 0.6 : 0.3
            const translateX = offset * 340

            if (Math.abs(offset) > 2) return null

            return (
              <div
                key={game.id}
                className={`card ${isSelected ? 'selected' : ''}`}
                style={{
                  width: 280,
                  flexShrink: 0,
                  transform: `translateX(${translateX - selectedIndex * 0}px) scale(${scale})`,
                  opacity,
                  transition: 'all 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                  position: 'absolute',
                  top: 50,
                  left: '50%',
                  marginLeft: `${translateX - 140}px`,
                  cursor: isSelected ? 'pointer' : 'default',
                }}
                onClick={() => isSelected ? confirm() : setSelectedIndex(i)}
              >
                <div style={{
                  width: '100%',
                  height: 180,
                  background: game.image_url
                    ? `url(${game.image_url}) center/cover`
                    : `linear-gradient(135deg, ${game.color || '#2a1a3a'}, #0a0a1a)`,
                  borderRadius: '14px 14px 0 0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {!game.image_url && (
                    <span style={{ fontSize: 4 + 'rem' }}>{game.emoji || '🎮'}</span>
                  )}
                </div>
                <div style={{ padding: '1.2rem' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700 }}>
                    {game.name}
                  </div>
                  <div style={{ color: 'var(--text2)', fontSize: '0.9rem', marginTop: 4 }}>
                    от {game.price_per_hour} ₽/час
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Dots */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20 }}>
          {games.map((_, i) => (
            <div key={i} style={{
              width: i === selectedIndex ? 24 : 8,
              height: 8,
              borderRadius: 4,
              background: i === selectedIndex ? 'var(--accent)' : 'var(--card-border)',
              transition: 'all 0.2s',
            }} />
          ))}
        </div>
      </div>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="screen">
      <div style={{
        width: 60, height: 60, borderRadius: '50%',
        border: '3px solid var(--card-border)',
        borderTopColor: 'var(--accent)',
        animation: 'spin 0.8s linear infinite',
      }} />
    </div>
  )
}

const DEMO_GAMES = [
  { id: 1, name: 'Шашки', steam_app_id: '244210', car_id: 'bmw_z4_s1', track_id: 'shuto_revival_project_beta', price_per_hour: 150, emoji: '🏁', color: '#1a1a2a' },
  { id: 2, name: 'Дрифт', steam_app_id: '244210', car_id: 'bmw_m3_e92_drift', track_id: 'shuto_revival_project_beta', price_per_hour: 150, emoji: '💨', color: '#1a1a2a' },
  { id: 3, name: 'F1', steam_app_id: '244210', car_id: 'f1_2020_mercedes', track_id: 'monza', price_per_hour: 150, emoji: '🏎️', color: '#c0392b' },
]
