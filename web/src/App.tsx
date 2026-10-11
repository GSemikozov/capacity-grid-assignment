import { useEffect, useState } from 'react'
import { CapacityGrid } from './CapacityGrid'
import { rangeFromSearch, rangeOf } from './weeks'

// Opens on the weeks around the turn of the year, where the seed's
// hand-written edge cases live.
const DEFAULT_RANGE = rangeOf('2025-12-29', '2026-01-16')

export function App() {
  const [range, setRange] = useState(() => rangeFromSearch(window.location.search) ?? DEFAULT_RANGE)

  // Mirror the range into the URL so a reload or a shared link shows the same weeks.
  // Replace rather than push: one history entry per click on "Next week" would bury Back.
  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('from', range.from)
    url.searchParams.set('to', range.to)
    window.history.replaceState(null, '', url)
  }, [range])

  return (
    <main>
      <h1>Team capacity</h1>
      <p className="lede">Hours allocated per week against each person’s weekly hours.</p>
      <CapacityGrid range={range} onRangeChange={setRange} />
    </main>
  )
}
