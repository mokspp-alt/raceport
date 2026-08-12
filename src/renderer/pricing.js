export const TIME_OPTIONS = [
  { minutes: 5, label: '5 мин', price: 200 },
  { minutes: 15, label: '15 мин', price: 500 },
  { minutes: 30, label: '30 мин', price: 800 },
  { minutes: 60, label: '1 час', price: 1000 },
]

export function priceForMinutes(minutes) {
  return TIME_OPTIONS.find(o => o.minutes === minutes)?.price ?? 0
}
