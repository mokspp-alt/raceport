import { useState, useEffect, useRef, useCallback } from 'react'
import { createPayment, pollPaymentStatus } from '../../services/yookassa'
import { createSession, recordTransaction } from '../../services/db'
import { pushTransaction } from '../../services/remoteSync'
import { useControllerEvent } from '../hooks/useController'
import { priceForMinutes } from '../pricing'
import { gameLabel } from '../gameLabels'
import logo from '../assets/brand/logo.png'

// Test mode: no YooKassa keys needed
const TEST_MODE = !import.meta.env.VITE_YOOKASSA_SHOP_ID ||
  import.meta.env.VITE_YOOKASSA_SHOP_ID === 'your_shop_id'

export default function Payment({ game, minutes, onSuccess, onBack }) {
  const [state, setState] = useState(TEST_MODE ? 'test' : 'creating')
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const [timeLeft, setTimeLeft] = useState(600)
  const timerRef = useRef(null)

  const amountRub = priceForMinutes(minutes)

  // Real payment flow
  useEffect(() => {
    if (TEST_MODE) return
    let cancelled = false

    async function initPayment() {
      try {
        const result = await createPayment({
          amountRub,
          description: `${game?.name || 'Игра'} — ${minutes} мин`,
          metadata: { gameId: game?.id, minutes },
        })

        if (cancelled) return

        setQrDataUrl(result.qrDataUrl)
        setState('waiting')

        timerRef.current = setInterval(() => {
          setTimeLeft(t => {
            if (t <= 1) { clearInterval(timerRef.current); setState('error'); return 0 }
            return t - 1
          })
        }, 1000)

        await pollPaymentStatus(result.paymentId, {
          onSuccess: async (pid) => {
            if (cancelled) return
            clearInterval(timerRef.current)
            await handlePaid(pid)
          },
          onCancel: () => { if (!cancelled) setState('error') },
          timeoutMs: 600000,
        })
      } catch (err) {
        if (!cancelled) setState('error')
        console.error('Payment error:', err)
      }
    }

    initPayment()
    return () => { cancelled = true; clearInterval(timerRef.current) }
  }, [])

  async function handlePaid(paymentId) {
    setState('success')
    try {
      const session = await createSession({
        gameId: game?.id,
        paymentId,
        durationMinutes: minutes,
        amountRub,
      })
      await recordTransaction({ sessionId: session.id, paymentId, amountRub, type: 'initial' })
      pushTransaction({ sessionId: session.id, paymentId, gameName: game?.name, amountRub, durationMinutes: minutes, type: 'initial' })
      setTimeout(() => {
        window.kiosk?.launchGame({
          steamAppId: game?.steam_app_id,
          carId: game?.car_id,
          trackId: game?.track_id,
          trackConfig: game?.track_config,
          skin: game?.skin,
          driftMode: game?.drift_mode,
          acExePath: game?.ac_exe_path,
          durationSeconds: minutes * 60,
        }).then(() => onSuccess(session))
      }, 2000)
    } catch (err) {
      console.error('Session create failed:', err)
      onSuccess({ id: null })
    }
  }

  // Test mode: immediate confirm
  function handleTestConfirm() {
    handlePaid('test-' + Date.now())
  }

  const back = useCallback(() => {
    clearInterval(timerRef.current)
    onBack()
  }, [onBack])

  useControllerEvent('back', back)
  useControllerEvent('confirm', useCallback(() => {
    if (state === 'test') handleTestConfirm()
  }, [state]))

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="screen fade-in" style={{ background: '#151518', flexDirection: 'column', gap: 40, padding: 50, fontFamily: 'var(--font-display)' }}>
      <img src={logo} alt="Raceport" style={{ height: 84, objectFit: 'contain' }} />

      {/* TEST MODE */}
      {state === 'test' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
          <div style={{
            background: '#2a1500',
            border: '1px solid #f4a261',
            borderRadius: 200,
            padding: '0.4rem 1rem',
            color: '#f4a261',
            fontSize: '0.85rem',
            letterSpacing: '0.15em',
          }}>
            ТЕСТОВЫЙ РЕЖИМ
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'white' }}>
              {gameLabel(game)}
            </div>
            <div style={{ fontSize: '1rem', color: '#8e8e93' }}>{minutes} мин · {amountRub} ₽</div>
          </div>

          <div style={{
            width: 300, height: 300,
            background: '#1c1c22',
            border: '2px dashed var(--card-border)',
            borderRadius: 30,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
          }}>
            <div style={{ fontSize: '4rem' }}>💳</div>
            <div style={{ color: 'var(--text2)', fontSize: '0.9rem', textAlign: 'center', padding: '0 1rem' }}>
              QR-код появится<br />после настройки YooKassa
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button className="btn btn-secondary" style={{ fontFamily: 'var(--font-display)' }} onClick={back}>← Назад</button>
            <button className="btn btn-primary selected" style={{ fontFamily: 'var(--font-display)' }} onClick={handleTestConfirm}>
              ✓ Подтвердить оплату (тест)
            </button>
          </div>
        </div>
      )}

      {/* CREATING */}
      {state === 'creating' && <Spinner label="Создаём платёж..." />}

      {/* WAITING FOR QR SCAN */}
      {state === 'waiting' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'white' }}>
              {gameLabel(game)}
            </div>
            <div style={{ fontSize: '1rem', color: '#8e8e93' }}>отсканируйте qr-код · {amountRub} ₽ · {minutes} мин</div>
          </div>

          <div style={{
            background: 'white', borderRadius: 30, padding: 20,
            display: 'inline-block', boxShadow: '0 0 60px rgba(255,225,0,0.3)',
          }}>
            {qrDataUrl
              ? <img src={qrDataUrl} alt="QR" style={{ width: 300, height: 300, display: 'block' }} />
              : <div style={{ width: 300, height: 300, background: '#eee' }} />
            }
          </div>

          <div style={{ color: 'var(--text2)' }}>
            QR действует: <span style={{ color: timeLeft < 60 ? '#ffe100' : 'var(--text)', fontWeight: 700 }}>
              {formatTime(timeLeft)}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', color: 'var(--text2)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4caf50', animation: 'pulse 1.5s ease infinite' }} />
            Ожидаем оплату...
          </div>

          <button className="btn btn-secondary" style={{ fontFamily: 'var(--font-display)' }} onClick={back}>← Назад</button>
        </div>
      )}

      {/* SUCCESS */}
      {state === 'success' && (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: '5rem' }}>✅</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#4caf50' }}>Оплачено!</div>
          <div style={{ fontSize: '1rem', color: '#8e8e93' }}>запускаем {gameLabel(game)}...</div>
        </div>
      )}

      {/* ERROR */}
      {state === 'error' && (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: '5rem' }}>❌</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#ffe100' }}>Время истекло</div>
          <div style={{ fontSize: '1rem', color: '#8e8e93' }}>платёж не завершён</div>
          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button className="btn btn-secondary" style={{ fontFamily: 'var(--font-display)' }} onClick={back}>← Назад</button>
            <button className="btn btn-primary" style={{ fontFamily: 'var(--font-display)' }} onClick={() => { setState('creating'); setTimeLeft(600) }}>
              Попробовать снова
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Spinner({ label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
      <div style={{
        width: 60, height: 60, borderRadius: '50%',
        border: '3px solid var(--card-border)',
        borderTopColor: '#ffe100',
        animation: 'spin 0.8s linear infinite',
      }} />
      <div style={{ color: 'var(--text2)' }}>{label}</div>
    </div>
  )
}
