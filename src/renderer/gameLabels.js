export const GAME_LABELS = {
  drift: 'дрифт',
  shashki: 'шашки',
  rally: 'ралли',
  nurburgring: 'нюрбургринг',
  gt3: 'gt3',
  f1: 'f1',
}

export function gameLabel(game) {
  return GAME_LABELS[game?.name] || game?.name || ''
}
