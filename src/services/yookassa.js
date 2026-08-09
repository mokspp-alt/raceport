import axios from 'axios'
import { v4 as uuidv4 } from 'uuid'
import QRCode from 'qrcode'

const BASE_URL = 'https://api.yookassa.ru/v3'

function getAuth() {
  const shopId = import.meta.env.VITE_YOOKASSA_SHOP_ID
  const secretKey = import.meta.env.VITE_YOOKASSA_SECRET_KEY
  return { username: shopId, password: secretKey }
}

export async function createPayment({ amountRub, description, metadata }) {
  const idempotenceKey = uuidv4()

  const response = await axios.post(
    `${BASE_URL}/payments`,
    {
      amount: {
        value: amountRub.toFixed(2),
        currency: 'RUB',
      },
      confirmation: {
        type: 'qr',
      },
      capture: true,
      description,
      metadata,
    },
    {
      auth: getAuth(),
      headers: {
        'Idempotence-Key': idempotenceKey,
        'Content-Type': 'application/json',
      },
    }
  )

  const payment = response.data
  const confirmationUrl = payment.confirmation?.confirmation_url

  let qrDataUrl = null
  if (confirmationUrl) {
    qrDataUrl = await QRCode.toDataURL(confirmationUrl, {
      width: 400,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    })
  }

  return {
    paymentId: payment.id,
    status: payment.status,
    qrDataUrl,
    confirmationUrl,
  }
}

export async function getPaymentStatus(paymentId) {
  const response = await axios.get(`${BASE_URL}/payments/${paymentId}`, {
    auth: getAuth(),
  })
  return response.data.status // pending | waiting_for_capture | succeeded | canceled
}

export async function pollPaymentStatus(paymentId, { onSuccess, onCancel, intervalMs = 3000, timeoutMs = 600000 }) {
  const start = Date.now()

  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      try {
        if (Date.now() - start > timeoutMs) {
          clearInterval(interval)
          onCancel?.('timeout')
          resolve('timeout')
          return
        }

        const status = await getPaymentStatus(paymentId)

        if (status === 'succeeded') {
          clearInterval(interval)
          onSuccess?.(paymentId)
          resolve('succeeded')
        } else if (status === 'canceled') {
          clearInterval(interval)
          onCancel?.(status)
          resolve('canceled')
        }
      } catch (err) {
        // Network error — continue polling
        console.error('Poll error:', err.message)
      }
    }, intervalMs)
  })
}
