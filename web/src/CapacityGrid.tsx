import { type CSSProperties, memo, useState } from 'react'
import type { CapacityResponse, PersonCapacity } from './api'
import { formatHours, sentence } from './format'
import { RangeControls } from './RangeControls'
import { useCapacity } from './useCapacity'
import { WeeklyHoursCell } from './WeeklyHoursCell'
import { formatDayMonth, formatRange, isoWeek, localToday, startOfWeek, type WeekRange } from './weeks'

type Props = {
  range: WeekRange
  onRangeChange: (range: WeekRange) => void
}

// CapacityGrid renders one row per person and one column per week, showing
// how many hours each person is allocated against their weekly capacity.
//
// The range is owned by the page, so the team timeline that will sit next to
// this view can follow the same weeks.
export function CapacityGrid({ range, onRangeChange }: Props) {
  const query = useCapacity(range.from, range.to)
  // The last range that loaded. Placeholder data covers a range that is still
  // loading; this also covers one that failed, so a failed "Next week" leaves
  // the grid the manager was reading on screen instead of an empty error box.
  const [lastLoaded, setLastLoaded] = useState(query.data)
  if (query.data && query.data !== lastLoaded) setLastLoaded(query.data)
  const data = query.data ?? lastLoaded
  const showingPrevious = query.isPlaceholderData || !query.data

  return (
    <section className="capacity" aria-labelledby="capacity-heading">
      <h2 id="capacity-heading" className="sr-only">
        Capacity by week
      </h2>
      <RangeControls range={range} onChange={onRangeChange} />

      {!data && query.isPending ? (
        <p role="status" className="notice">
          Loading capacity for {formatRange(range)}…
        </p>
      ) : !data ? (
        <div role="alert" className="notice notice--error">
          <p>
            Couldn’t load capacity for {formatRange(range)}: {sentence(query.error?.message ?? 'unknown error')}
          </p>
          <button type="button" onClick={() => query.refetch()}>
            Try again
          </button>
        </div>
      ) : (
        <>
          <GridStatus
            data={data}
            requested={range}
            showingPrevious={showingPrevious}
            error={query.isError ? query.error.message : null}
            onRetry={() => query.refetch()}
          />
          <Grid data={data} stale={showingPrevious} />
        </>
      )}
    </section>
  )
}

type GridStatusProps = {
  /** What the grid shows: the requested range, or the last one that loaded. */
  data: CapacityResponse
  requested: WeekRange
  /** `data` is an earlier range than `requested`: it is still loading or it failed. */
  showingPrevious: boolean
  error: string | null
  onRetry: () => void
}

function GridStatus({ data, requested, showingPrevious, error, onRetry }: GridStatusProps) {
  const overCount = data.people.filter((p) => p.allocated.some((hours) => isOver(hours, p.weeklyHours))).length
  return (
    <div className="grid-status">
      {/* Always mounted so screen readers announce changes to it. */}
      <p role="status" className="grid-summary">
        {showingPrevious && !error ? (
          <>
            Loading {formatRange(requested)}… still showing {formatRange(data)}.
          </>
        ) : (
          <>
            <strong>{overCount}</strong> of {data.people.length} people are over capacity in at least one week of{' '}
            {formatRange(data)}.
          </>
        )}
      </p>
      {error && (
        <div role="alert" className="notice notice--error">
          <p>
            {showingPrevious
              ? `Couldn’t load ${formatRange(requested)}: ${sentence(error)} Still showing ${formatRange(data)}.`
              : `Couldn’t refresh: ${sentence(error)} The numbers below may be out of date.`}
          </p>
          <button type="button" onClick={onRetry}>
            Reload capacity
          </button>
        </div>
      )}
    </div>
  )
}

function Grid({ data, stale }: { data: CapacityResponse; stale: boolean }) {
  const currentWeek = data.weeks.indexOf(startOfWeek(localToday()))
  const overPerWeek = data.weeks.map((_, i) => data.people.filter((p) => isOver(p.allocated[i], p.weeklyHours)).length)
  return (
    // Focusable so keyboard users can scroll a grid wider than the screen.
    <div className="grid-scroll" role="region" aria-label="Capacity grid" tabIndex={0}>
      <table className={stale ? 'grid grid--stale' : 'grid'} aria-busy={stale}>
        <caption className="sr-only">
          Hours allocated per person per week. Cells over the person’s weekly hours are marked as over capacity.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="col-name">
              Person
            </th>
            <th scope="col" className="col-hours">
              Weekly hours
            </th>
            {data.weeks.map((week, i) => (
              <th key={week} scope="col" className={i === currentWeek ? 'col-week is-current' : 'col-week'}>
                <time dateTime={week}>{formatDayMonth(week)}</time>
                <span className="week-number">
                  W{String(isoWeek(week)).padStart(2, '0')}
                  {i === currentWeek && ' · this week'}
                </span>
                {overPerWeek[i] > 0 && <span className="week-over">{overPerWeek[i]} over</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.people.map((person) => (
            <PersonRow key={person.id} person={person} currentWeek={currentWeek} editable={!stale} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

type PersonRowProps = {
  person: PersonCapacity
  currentWeek: number
  editable: boolean
}

// Memoised: a save replaces one person object, so only that row re-renders.
const PersonRow = memo(function PersonRow({ person, currentWeek, editable }: PersonRowProps) {
  return (
    <tr>
      <th scope="row" className="col-name" title={person.name}>
        {person.name}
      </th>
      <td className="col-hours">
        <WeeklyHoursCell person={person} disabled={!editable} />
      </td>
      {person.allocated.map((hours, i) => (
        <AllocationCell
          // Index-aligned with data.weeks, so the index is the week.
          key={i}
          hours={hours}
          capacity={person.weeklyHours}
          current={i === currentWeek}
        />
      ))}
    </tr>
  )
})

function AllocationCell({ hours, capacity, current }: { hours: number; capacity: number; current: boolean }) {
  const over = isOver(hours, capacity)
  // With zero weekly hours, "+20" over nothing reads oddly; name the actual problem.
  const overLabel = capacity > 0 ? `+${formatHours(hours - capacity)}` : 'no capacity'
  const load = capacity > 0 ? Math.min(hours / capacity, 1) : hours > 0 ? 1 : 0
  const className = ['alloc', over && 'alloc--over', hours === 0 && 'alloc--empty', current && 'is-current']
    .filter(Boolean)
    .join(' ')
  return (
    <td className={className} style={{ '--load': load } as CSSProperties}>
      <span className="alloc-hours">{formatHours(hours)}</span>
      {over && (
        <span className="alloc-over" aria-hidden="true">
          {overLabel}
        </span>
      )}
      <span className="sr-only">
        {!over ? ' hours' : capacity > 0 ? ` hours, ${formatHours(hours - capacity)} over capacity` : ' hours, no capacity'}
      </span>
    </td>
  )
}

/** Any allocation over capacity, including any allocation at all for someone with zero hours. */
export function isOver(hours: number, capacity: number): boolean {
  return hours - capacity > 1e-9
}
