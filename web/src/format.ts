const hours = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })

export function formatHours(value: number): string {
  return hours.format(value)
}
