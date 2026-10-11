const hours = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })

export function formatHours(value: number): string {
  return hours.format(value)
}

/** Ends a message with a full stop, so another sentence can follow it. */
export function sentence(message: string): string {
  return /[.!?]$/.test(message) ? message : `${message}.`
}
