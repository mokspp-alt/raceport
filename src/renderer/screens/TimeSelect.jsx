import { useState, useCallback } from 'react'
import { useControllerEvent } from '../hooks/useController'

const TIME_OPTIONS = [
  { minutes: 15, label: '15 мин' },
  { minutes: 30, label: '30 мин' },
  { minutes: 45, label: '45 мин' },
  { minutes: 60, label: '1 час' },
]

export default function TimeSelect({ game, onSelect, onBack }) {
  const [selectedIndex, setSelectedIndex] = useState(1)

  const price = game
    ? Math.round((game.price_per_hour / 60) * TIME_OPTIONS[selectedIndex].minutes)
    : 0

  const moveLeft = useCallback(() => setSelectedIndex(i => Math.max(0, i - 1)), [])
  const moveRight = useCallback(() => setSelectedIndex(i => Math.min(TIME_OPTIONS.length - 1, i + 1)), [])
  const confirm = useCallback(() => onSelect(TIME_OPTIONS[selectedIndex].minutes), [selectedIndex, onSelect])
  const back = useCallback(() => onBack(), [onBack])

  useControllerEvent('left', moveLeft)
  useControllerEvent('right', moveRight)
  useControllerEvent('up', moveLeft)
  useControllerEvent('down', moveRight)
  useControllerEvent('confirm', confirm)
  useControllerEvent('back', back)

  return (
    <div className="screen fade-in" style={{ background: 'radial-gradient(ellipse at center, #1a0f0a 0%, #0a0a0f 70%)' }}>
      <div style={{ textAlign: 'center', maxWidth: 900 }}>
        <div style={{ color: 'var(--text2)', fontSize: '1rem', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 8 }}>
          {game?.name}
        </div>
        <div className="screen-title">Сколько играем?</div>
        <div className="screen-subtitle">◄ ► выбор · A подтвердить · B назад</div>

        <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center' }}>
          {TIME_OPTIONS.map((opt, i) => {
            const isSelected = i === selectedIndex
            const optPrice = Math.round((game?.price_per_hour / 60) * opt.minutes)
            return (
              <div
                key={i}
                className={`card ${isSelected ? 'selected' : ''}`}
                style={{
                  width: 180,
                  padding: '2rem 1.5rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transform: isSelected ? 'scale(1.08)' : 'scale(1)',
                  transition: 'all 0.2s',
                }}
                onClick={() => { setSelectedIndex(i); if (isSelected) confirm() }}
              >
                <div style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '2rem',
                  fontWeight: 900,
                  color: isSelected ? 'var(--accent)' : 'var(--text)',
                }}>
                  {opt.label}
                </div>
                <div style={{
                  marginTop: '1rem',
                  fontSize: '1.4rem',
                  fontWeight: 700,
                  color: isSelected ? 'white' : 'var(--text2)',
                }}>
                  {optPrice} ₽
                </div>
              </div>
            )
          })}
        </div>

        <div style={{
          marginTop: '3rem',
          padding: '1.5rem 3rem',
          background: 'var(--card-bg)',
          borderRadius: 12,
          display: 'inline-block',
          border: '1px solid var(--card-border)',
        }}>
          <span style={{ color: 'var(--text2)' }}>К оплате: </span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--accent)' }}>
            {price} ₽
          </span>
        </div>

        <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <button className="btn btn-secondary" onClick={onBack}>← Назад</button>
          <button className="btn btn-primary" onClick={confirm}>
            Оплатить {price} ₽ →
          </button>
        </div>
      </div>
    </div>
  )
}
