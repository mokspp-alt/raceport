import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// ─── Games ────────────────────────────────────────────────────────────────────

export async function getActiveGames() {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('active', true)
    .order('display_order', { ascending: true })

  if (error) throw error
  return data
}

export async function addGame(game) {
  const { data, error } = await supabase
    .from('games')
    .insert(game)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateGame(id, updates) {
  const { data, error } = await supabase
    .from('games')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteGame(id) {
  const { error } = await supabase.from('games').delete().eq('id', id)
  if (error) throw error
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function createSession({ gameId, paymentId, durationMinutes, amountRub }) {
  const { data, error } = await supabase
    .from('sessions')
    .insert({
      game_id: gameId,
      payment_id: paymentId,
      duration_minutes: durationMinutes,
      amount_rub: amountRub,
      status: 'active',
      started_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateSession(id, updates) {
  const { data, error } = await supabase
    .from('sessions')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function finishSession(id) {
  return updateSession(id, {
    status: 'finished',
    finished_at: new Date().toISOString(),
  })
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function recordTransaction({ sessionId, paymentId, amountRub, type }) {
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      session_id: sessionId,
      yookassa_payment_id: paymentId,
      amount_rub: amountRub,
      type, // 'initial' | 'extension'
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getStats({ from, to }) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*, sessions(game_id, games(name))')
    .gte('created_at', from)
    .lte('created_at', to)

  if (error) throw error
  return data
}

export default supabase
