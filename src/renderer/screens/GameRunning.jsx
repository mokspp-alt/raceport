import { useState, useEffect, useCallback } from 'react'
import { createPayment, pollPaymentStatus } from '../../services/yookassa'
import { recordTransaction } from '../../services/db'
import { useControllerEvent } from '../hooks/useController'

const TEST_MODE = !import.meta.env.VITE_YOOKASSA_SHOP_ID ||
  import.meta.env.VITE_YOOKASSA_SHOP_ID === 'your_shop_id'

export default function GameRunning({ game, session, onEnd, onExtend }) {
  const [remaining, setRemaining] = useState(0)
  const [showWarning, setShowWarning] = useState(false)
  const [showExtend, setShowExtend] = useState(false)
  const [extendState, setExtendState] = useState(null) // null | paying | success

  // Sync timer from main process
  useEffect(() => {
    const onTick = ({ remaining: r }) => setRemaining(r)
    const onWarning = ({ remaining: r }) => {
      setRemaining(r)
      setShowWarning(true)
      // Auto-show extend dialog after 10s
      setTimeout(() => setShowExtend(true), 10000)
    }
    const onExpired = () => {
      setShowWarning(false)
      setShowExtend(false)
      onEnd()
    }

    window.kiosk?.on('timer-tick', onTick)
    window.kiosk?.on('timer-warning', onWarning)
    window.kiosk?.on('timer-expired', onExpired)

    window.kiosk?.getTimer().then(r => setRemaining(r))

    return () => {
      window.kiosk?.off('timer-tick', onTick)
      window.kiosk?.off('timer-warning', onWarning)
      window.kiosk?.off('timer-expired', onExpired)
    }
  }, [onEnd])

  const formatTime = (s) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  const isLow = remaining <= 300
  const isCritical = remaining <= 60

  const handleExtend = useCallback(async (minutes) => {
    const pricePerHour = game?.price_per_hour || 150
    const amountRub = Math.round((pricePerHour / 60) * minutes)

    setExtendState('paying')

    async function applyExtension(pid) {
      await window.kiosk?.addTime({ additionalSeconds: minutes * 60 })
      try {
        await recordTransaction({ sessionId: session?.id, paymentId: pid, amountRub, type: 'extension' })
      } catch (_) {}
      setExtendState('success')
      setShowWarning(false)
      setShowExtend(false)
      onExtend(session)
      setTimeout(() => setExtendState(null), 2000)
    }

    if (TEST_MODE) {
      await applyExtension('test-extend-' + Date.now())
      return
    }

    try {
      const result = await createPayment({
        amountRub,
        description: `Продление: ${game?.name} +${minutes} мин`,
        metadata: { sessionId: session?.id, minutes, type: 'extension' },
      })
      await pollPaymentStatus(result.paymentId, {
        onSuccess: (pid) => applyExtension(pid),
        onCancel: () => setExtendState(null),
      })
    } catch (err) {
      setExtendState(null)
    }
  }, [game, session, onExtend])

  const dismiss = useCallback(() => {
    setShowWarning(false)
    setShowExtend(false)
  }, [])

  useControllerEvent('confirm', useCallback(() => {
    if (showExtend) handleExtend(30)
    else if (showWarning) setShowExtend(true)
  }, [showExtend, showWarning, handleExtend]))

  useControllerEvent('back', dismiss)

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      position: 'relative',
      background: '#151518',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'flex-end',
    }}>
      {/* Timer overlay (top-right corner) */}
      <div style={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 100,
        background: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(8px)',
        border: `2px solid ${isCritical ? '#ff0000' : isLow ? 'var(--accent)' : 'var(--card-border)'}`,
        borderRadius: 12,
        padding: '0.6rem 1.2rem',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        boxShadow: isCritical ? '0 0 20px rgba(255,0,0,0.5)' : 'none',
      }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: isCritical ? '#ff0000' : '#4caf50',
          animation: isCritical ? 'pulse 0.5s ease infinite' : 'none',
        }} />
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.6rem',
          color: isCritical ? '#ff4444' : isLow ? 'var(--accent)' : 'white',
          fontWeight: 700,
          animation: isCritical ? 'pulse 0.5s ease infinite' : 'none',
        }}>
          {formatTime(remaining)}
        </span>
      </div>

      {/* Warning overlay */}
      {showWarning && !showExtend && (
        <div style={{
          position: 'fixed',
          bottom: 40,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.9)',
          border: '2px solid var(--accent)',
          borderRadius: 16,
          padding: '1.5rem 3rem',
          textAlign: 'center',
          zIndex: 200,
          animation: 'fadeIn 0.3s ease',
          boxShadow: '0 0 40px rgba(230,57,70,0.4)',
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--accent)' }}>
            ⚠️ Осталось {formatTime(remaining)}
          </div>
          <div style={{ color: 'var(--text2)', marginTop: 8 }}>
            Нажмите A чтобы продолжить игру
          </div>
        </div>
      )}

      {/* Extend time modal */}
      {showExtend && !extendState && (
        <Modal>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', marginBottom: '0.5rem' }}>
              Продлить время?
            </div>
            <div style={{ color: 'var(--text2)', marginBottom: '2rem' }}>
              Осталось: {formatTime(remaining)}
            </div>
            <ExtendOptions game={game} onSelect={handleExtend} onClose={dismiss} />
          </div>
        </Modal>
      )}

      {extendState === 'paying' && (
        <Modal>
          <PayingScreen />
        </Modal>
      )}

      {extendState === 'success' && (
        <Modal>
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{ fontSize: '4rem' }}>✅</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginTop: '1rem', color: '#4caf50' }}>
              Время добавлено!
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function ExtendOptions({ game, onSelect, onClose }) {
  const [selected, setSelected] = useState(0)
  const options = [
    { minutes: 15, label: '+15 мин' },
    { minutes: 30, label: '+30 мин' },
    { minutes: 60, label: '+1 час' },
  ]

  useControllerEvent('left', useCallback(() => setSelected(i => Math.max(0, i - 1)), []))
  useControllerEvent('right', useCallback(() => setSelected(i => Math.min(options.length - 1, i + 1)), []))

  const pricePerHour = game?.price_per_hour || 150

  return (
    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '1.5rem' }}>
      {options.map((opt, i) => {
        const price = Math.round((pricePerHour / 60) * opt.minutes)
        return (
          <div
            key={i}
            className={`card ${selected === i ? 'selected' : ''}`}
            style={{
              width: 160,
              padding: '1.5rem 1rem',
              textAlign: 'center',
              cursor: 'pointer',
              transform: selected === i ? 'scale(1.06)' : 'scale(1)',
              transition: 'all 0.2s',
            }}
            onClick={() => selected === i ? onSelect(opt.minutes) : setSelected(i)}
          >
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700 }}>
              {opt.label}
            </div>
            <div style={{ color: 'var(--accent)', fontSize: '1.2rem', marginTop: 8 }}>
              {price} ₽
            </div>
          </div>
        )
      })}
      <div style={{ marginTop: '1.5rem' }}>
        <button className="btn btn-secondary" onClick={onClose} style={{ marginTop: 10 }}>
          Продолжить без продления
        </button>
      </div>
    </div>
  )
}

function Modal({ children }) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.85)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 300,
      animation: 'fadeIn 0.25s ease',
    }}>
      <div className="card" style={{ padding: '3rem', minWidth: 400 }}>
        {children}
      </div>
    </div>
  )
}

function PayingScreen() {
  const [dots, setDots] = useState('')
  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500)
    return () => clearInterval(t)
  }, [])
  return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <div style={{
        width: 60, height: 60, borderRadius: '50%',
        border: '3px solid var(--card-border)',
        borderTopColor: 'var(--accent)',
        animation: 'spin 0.8s linear infinite',
        margin: '0 auto 1.5rem',
      }} />
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem' }}>
        Ожидаем оплату{dots}
      </div>
      <div style={{ color: 'var(--text2)', marginTop: 8, fontSize: '0.9rem' }}>
        Проверьте свой телефон
      </div>
    </div>
  )
}
