import shashkiPreview from './assets/games/shashki.png'
import driftPreview from './assets/games/drift.png'
import rallyPreview from './assets/games/rally.png'
import gt3Preview from './assets/games/gt3.png'
import f1Preview from './assets/games/f1.png'

export const PREVIEWS = {
  drift: driftPreview,
  shashki: shashkiPreview,
  rally: rallyPreview,
  gt3: gt3Preview,
  f1: f1Preview,
}

export function gamePreview(game) {
  return PREVIEWS[game?.name] || game?.image_url
}
