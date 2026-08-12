import { useState, useEffect, useCallback } from 'react'
import GameSelect from './screens/GameSelect'
import TimeSelect from './screens/TimeSelect'
import Payment from './screens/Payment'
import GameRunning from './screens/GameRunning'
import Admin from './screens/Admin'
import useController from './hooks/useController'

// Screens: gameSelect → timeSelect → payment → gameRunning
export default function App() {
  const [screen, setScreen] = useState('gameSelect')
  const [selectedGame, setSelectedGame] = useState(null)
  const [selectedMinutes, setSelectedMinutes] = useState(null)
  const [sessionData, setSessionData] = useState(null)
  const [adminOpen, setAdminOpen] = useState(false)

  useEffect(() => {
    window.kiosk?.on('open-admin', () => setAdminOpen(true))

    // Fallback for when the OS-level Ctrl+Shift+A shortcut is silently
    // stolen by another app (Electron's globalShortcut.register() fails
    // without error in that case) — this fires as long as the window has
    // focus, which it always does outside kiosk/fullscreen production mode.
    const onKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') setAdminOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const navigate = useCallback((to, data = {}) => {
    if (data.game) setSelectedGame(data.game)
    if (data.minutes) setSelectedMinutes(data.minutes)
    if (data.session) setSessionData(data.session)
    setScreen(to)
  }, [])

  const handleGameEnd = useCallback(() => {
    setSelectedGame(null)
    setSelectedMinutes(null)
    setSessionData(null)
    setScreen('gameSelect')
  }, [])

  useController()

  const screens = {
    gameSelect: (
      <GameSelect onSelect={(game) => navigate('timeSelect', { game })} />
    ),
    timeSelect: (
      <TimeSelect
        game={selectedGame}
        onSelect={(minutes) => navigate('payment', { minutes })}
        onBack={() => navigate('gameSelect')}
      />
    ),
    payment: (
      <Payment
        game={selectedGame}
        minutes={selectedMinutes}
        onSuccess={(session) => navigate('gameRunning', { session })}
        onBack={() => navigate('timeSelect')}
      />
    ),
    gameRunning: (
      <GameRunning
        game={selectedGame}
        session={sessionData}
        onEnd={handleGameEnd}
        onExtend={(session) => setSessionData(session)}
      />
    ),
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a0f' }}>
      {screens[screen]}
      {adminOpen && (
        <Admin onClose={() => setAdminOpen(false)} />
      )}
    </div>
  )
}
