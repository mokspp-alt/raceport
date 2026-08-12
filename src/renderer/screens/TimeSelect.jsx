import { useState, useCallback } from 'react'
import { useControllerEvent } from '../hooks/useController'
import { TIME_OPTIONS } from '../pricing'
import { gameLabel } from '../gameLabels'
import logo from '../assets/brand/logo.png'

export default function TimeSelect({ game, onSelect, onBack }) {
  const [selectedIndex, setSelectedIndex] = useState(2)

  const price = TIME_OPTIONS[selectedIndex].price

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
    <div className="screen fade-in" style={{ background: '#151518', flexDirection: 'column', gap: 40, padding: 50, fontFamily: 'var(--font-display)' }}>
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
          {gameLabel(game)}
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: '#8e8e93' }}>
          сколько играем?
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center' }}>
        {TIME_OPTIONS.map((opt, i) => {
          const isSelected = i === selectedIndex
          return (
            <div
              key={i}
              style={{
                width: 180,
                padding: '2rem 1.5rem',
                textAlign: 'center',
                cursor: 'pointer',
                background: '#1c1c22',
                borderRadius: 30,
                border: isSelected ? '3px solid #ffe100' : '3px solid transparent',
                boxShadow: isSelected ? '0 0 60px rgba(255,225,0,0.36)' : 'none',
                transform: isSelected ? 'scale(1.08)' : 'scale(1)',
                transition: 'all 0.2s',
              }}
              onClick={() => { setSelectedIndex(i); if (isSelected) confirm() }}
            >
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: '2rem',
                fontWeight: 700,
                color: isSelected ? '#ffe100' : 'var(--text)',
              }}>
                {opt.label}
              </div>
              <div style={{
                marginTop: '1rem',
                fontSize: '1.4rem',
                fontWeight: 700,
                color: isSelected ? 'white' : 'var(--text2)',
              }}>
                {opt.price} ₽
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        <button className="btn btn-secondary" style={{ fontFamily: 'var(--font-display)' }} onClick={onBack}>← Назад</button>
        <button className="btn btn-primary" style={{ fontFamily: 'var(--font-display)' }} onClick={confirm}>
          Оплатить {price} ₽ →
        </button>
      </div>
    </div>
  )
}
