import { useState, useEffect, useRef, useCallback } from 'react'
import { createPayment, pollPaymentStatus } from '../../services/yookassa'
import { createSession, recordTransaction } from '../../services/db'
import { pushTransaction } from '../../services/remoteSync'
import { useControllerEvent } from '../hooks/useController'

// Test mode: no YooKassa keys needed
const TEST_MODE = !import.meta.env.VITE_YOOKASSA_SHOP_ID ||
  import.meta.env.VITE_YOOKASSA_SHOP_ID === 'your_shop_id'

export default function Payment({ game, minutes, onSuccess, onBack }) {
  const [state, setState] = useState(TEST_MODE ? 'test' : 'creating')
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const [timeLeft, setTimeLeft] = useState(600)
  const timerRef = useRef(null)

  const pricePerHour = game?.price_per_hour || 150
  const amountRub = Math.round((pricePerHour / 60) * minutes)

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
    <div className="screen fade-in" style={{ background: 'radial-gradient(ellipse at center, #0a1a0f 0%, #0a0a0f 70%)' }}>

      {/* TEST MODE */}
      {state === 'test' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{
            display: 'inline-block',
            background: '#2a1500',
            border: '1px solid #f4a261',
            borderRadius: 8,
            padding: '0.4rem 1rem',
            color: '#f4a261',
            fontSize: '0.85rem',
            letterSpacing: '0.15em',
            marginBottom: '1.5rem',
          }}>
            ТЕСТОВЫЙ РЕЖИМ
          </div>
          <div className="screen-title">Оплата</div>
          <div className="screen-subtitle">{game?.name} · {minutes} мин · {amountRub} ₽</div>

          <div style={{
            width: 300, height: 300,
            margin: '0 auto',
            background: 'var(--card-bg)',
            border: '2px dashed var(--card-border)',
            borderRadius: 20,
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

          <div style={{ marginTop: '2.5rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button className="btn btn-secondary" onClick={back}>← Назад</button>
            <button className="btn btn-primary selected" onClick={handleTestConfirm} style={{ fontSize: '1.3rem', padding: '1rem 3rem' }}>
              ✓ Подтвердить оплату (тест)
            </button>
          </div>
        </div>
      )}

      {/* CREATING */}
      {state === 'creating' && <Spinner label="Создаём платёж..." />}

      {/* WAITING FOR QR SCAN */}
      {state === 'waiting' && (
        <div style={{ textAlign: 'center' }}>
          <div className="screen-title">Оплата</div>
          <div className="screen-subtitle">Отсканируйте QR-код · {amountRub} ₽ · {minutes} мин</div>

          <div style={{
            background: 'white', borderRadius: 20, padding: 20,
            display: 'inline-block', boxShadow: '0 0 60px rgba(230,57,70,0.3)',
          }}>
            {qrDataUrl
              ? <img src={qrDataUrl} alt="QR" style={{ width: 300, height: 300, display: 'block' }} />
              : <div style={{ width: 300, height: 300, background: '#eee' }} />
            }
          </div>

          <div style={{ marginTop: '1.5rem', color: 'var(--text2)' }}>
            QR действует: <span style={{ color: timeLeft < 60 ? 'var(--accent)' : 'var(--text)', fontWeight: 700 }}>
              {formatTime(timeLeft)}
            </span>
          </div>

          <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', color: 'var(--text2)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4caf50', animation: 'pulse 1.5s ease infinite' }} />
            Ожидаем оплату...
          </div>

          <div style={{ marginTop: '2rem' }}>
            <button className="btn btn-secondary" onClick={back}>← Назад</button>
          </div>
        </div>
      )}

      {/* SUCCESS */}
      {state === 'success' && (
        <div style={{ textAlign: 'center' }} className="fade-in">
          <div style={{ fontSize: '5rem' }}>✅</div>
          <div className="screen-title" style={{ marginTop: '1rem', color: '#4caf50' }}>Оплачено!</div>
          <div className="screen-subtitle">Запускаем {game?.name}...</div>
        </div>
      )}

      {/* ERROR */}
      {state === 'error' && (
        <div style={{ textAlign: 'center' }} className="fade-in">
          <div style={{ fontSize: '5rem' }}>❌</div>
          <div className="screen-title" style={{ marginTop: '1rem', color: 'var(--accent)' }}>Время истекло</div>
          <div className="screen-subtitle">Платёж не завершён</div>
          <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button className="btn btn-secondary" onClick={back}>← Назад</button>
            <button className="btn btn-primary" onClick={() => { setState('creating'); setTimeLeft(600) }}>
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
    <div style={{ textAlign: 'center' }}>
      <div style={{
        width: 60, height: 60, borderRadius: '50%',
        border: '3px solid var(--card-border)',
        borderTopColor: 'var(--accent)',
        animation: 'spin 0.8s linear infinite',
        margin: '0 auto 1.5rem',
      }} />
      <div style={{ color: 'var(--text2)' }}>{label}</div>
    </div>
  )
}
