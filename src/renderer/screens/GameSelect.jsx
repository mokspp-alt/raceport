import { useState, useEffect, useCallback } from 'react'
import { getActiveGames } from '../../services/db'
import { syncGamesFromServer } from '../../services/remoteSync'
import { useControllerEvent } from '../hooks/useController'
import logo from '../assets/brand/logo.png'
import shashkiPreview from '../assets/games/shashki.png'
import driftPreview from '../assets/games/drift.png'
import rallyPreview from '../assets/games/rally.png'
import { GAME_LABELS } from '../gameLabels'

const PREVIEWS = { drift: driftPreview, shashki: shashkiPreview, rally: rallyPreview }

function HintPill({ children }) {
  return (
    <div style={{
      background: '#ffe100',
      color: 'black',
      borderRadius: 22,
      padding: '2px 7px',
      fontFamily: 'var(--font-display)',
      fontSize: '1rem',
      fontWeight: 700,
      lineHeight: 'normal',
      display: 'inline-block',
    }}>
      {children}
    </div>
  )
}

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
    <div className="screen fade-in" style={{ background: '#151518', flexDirection: 'column', gap: 40, padding: 50 }}>
      <img src={logo} alt="Raceport" style={{ height: 84, objectFit: 'contain' }} />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '2rem',
          fontWeight: 700,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: 'white',
        }}>
          Выберите игру
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', fontFamily: 'var(--font-display)', fontSize: '1rem', color: '#8e8e93' }}>
          <span>используйте</span>
          <HintPill>джойстик</HintPill>
          <span>для выбора</span>
          <HintPill>enter</HintPill>
          <span>для запуска</span>
        </div>
      </div>

      <div style={{ position: 'relative', height: 279, width: '100%' }}>
        {games.map((game, i) => {
          const offset = i - selectedIndex
          const isSelected = offset === 0
          const scale = isSelected ? 1 : Math.abs(offset) === 1 ? 0.85 : 0.7
          const opacity = isSelected ? 1 : Math.abs(offset) === 1 ? 0.6 : 0.3
          const translateX = offset * 460
          const preview = PREVIEWS[game.name] || game.image_url

          if (Math.abs(offset) > 2) return null

          return (
            <div
              key={game.id}
              style={{
                width: 427,
                height: 279,
                borderRadius: 29,
                overflow: 'hidden',
                position: 'absolute',
                top: 0,
                left: '50%',
                marginLeft: translateX - 427 / 2,
                transform: `scale(${scale})`,
                opacity,
                transition: 'all 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                cursor: isSelected ? 'pointer' : 'default',
                background: preview
                  ? `linear-gradient(rgba(0,0,0,0.15), rgba(0,0,0,0.55)), url(${preview}) center/cover`
                  : `linear-gradient(180deg, #2a343f, #1f2020)`,
                border: isSelected ? '3px solid #ffe100' : '3px solid transparent',
                boxShadow: isSelected ? '0 0 111px rgba(255,225,0,0.36)' : 'none',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                paddingTop: 51,
              }}
              onClick={() => isSelected ? confirm() : setSelectedIndex(i)}
            >
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: '2.25rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                color: 'white',
              }}>
                {GAME_LABELS[game.name] || game.name}
              </div>
            </div>
          )
        })}
      </div>

      {/* Dots */}
      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
        {games.map((_, i) => (
          <div key={i} style={{
            width: i === selectedIndex ? 24 : 10,
            height: 10,
            borderRadius: 14,
            background: i === selectedIndex ? 'white' : '#4f4f4f',
            transition: 'all 0.2s',
          }} />
        ))}
      </div>

      <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.75rem', color: '#8e8e93', textAlign: 'center' }}>
        <div>при возникновении сложностей свяжитесь с нами</div>
        <div>+7 993 441 07 01</div>
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
  { id: 1, name: 'drift',       steam_app_id: '244210', car_id: 'bmw_m3_e92_drift',     track_id: 'shuto_revival_project_beta', price_per_hour: 150, emoji: '💨', color: '#1a1a2a' },
  { id: 2, name: 'shashki',     steam_app_id: '244210', car_id: 'hsrc_mby_rx8_scarlet', skin: '00_velocity_red', track_id: 'horizon_life_moscow', drift_mode: 0, price_per_hour: 150, emoji: '🏁', color: '#1a1a2a' },
  { id: 3, name: 'nurburgring', steam_app_id: '244210', car_id: 'bmw_m4_akrapovic',     track_id: 'ks_nordschleife',           price_per_hour: 200, emoji: '🏔️', color: '#1a2a1a' },
  { id: 4, name: 'gt3',         steam_app_id: '244210', car_id: 'ks_porsche_911_gt3_r', track_id: 'ks_barcelona',             price_per_hour: 200, emoji: '🏆', color: '#2a1a0a' },
  { id: 5, name: 'f1',          steam_app_id: '244210', car_id: 'rss_formula_hybrid_2020', track_id: 'monza',                 price_per_hour: 250, emoji: '🏎️', color: '#c0392b' },
]
