import { useState } from 'react'
import { CapacityGrid } from './CapacityGrid'
import { rangeOf } from './weeks'

// Opens on the weeks around the turn of the year, where the seed's
// hand-written edge cases live.
const INITIAL_RANGE = rangeOf('2025-12-29', '2026-01-16')

export function App() {
  const [range, setRange] = useState(INITIAL_RANGE)
  return (
    <main>
      <h1>Team capacity</h1>
      <p className="lede">Hours allocated per week against each person’s weekly hours.</p>
      <CapacityGrid range={range} onRangeChange={setRange} />
    </main>
  )
}
