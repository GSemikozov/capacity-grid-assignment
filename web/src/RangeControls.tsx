import { useId } from 'react'
import {
  addDays,
  isValidDate,
  localToday,
  MAX_WEEKS,
  shiftRange,
  startOfWeek,
  type WeekRange,
  weekCount,
  withFrom,
  withTo,
} from './weeks'

type Props = {
  range: WeekRange
  onChange: (range: WeekRange) => void
}

export function RangeControls({ range, onChange }: Props) {
  const hintId = useId()
  const weeks = weekCount(range)

  function jumpToThisWeek() {
    const from = startOfWeek(localToday())
    onChange({ from, to: addDays(from, weeks * 7 - 1) })
  }

  return (
    <div className="range-controls" role="group" aria-label="Date range">
      <div className="range-nav">
        <button type="button" onClick={() => onChange(shiftRange(range, -1))}>
          ← Previous week
        </button>
        <button type="button" onClick={jumpToThisWeek}>
          This week
        </button>
        <button type="button" onClick={() => onChange(shiftRange(range, 1))}>
          Next week →
        </button>
      </div>
      <div className="range-dates">
        <label>
          From
          <input
            type="date"
            value={range.from}
            aria-describedby={hintId}
            // Ignore half-typed dates; they'd fire a request per keystroke.
            onChange={(event) => isValidDate(event.target.value) && onChange(withFrom(range, event.target.value))}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={range.to}
            aria-describedby={hintId}
            onChange={(event) => isValidDate(event.target.value) && onChange(withTo(range, event.target.value))}
          />
        </label>
        <span id={hintId} className="range-hint">
          {weeks} {weeks === 1 ? 'week' : 'weeks'}, Monday to Sunday (up to {MAX_WEEKS})
        </span>
      </div>
    </div>
  )
}
