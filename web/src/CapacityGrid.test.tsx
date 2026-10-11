import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CapacityResponse } from './api'
import { CapacityGrid } from './CapacityGrid'

const range = { from: '2026-01-05', to: '2026-01-18' }

function capacity(): CapacityResponse {
  return {
    ...range,
    weeks: ['2026-01-05', '2026-01-12'],
    people: [
      { id: 4, name: 'Dee Okafor', weeklyHours: 40, allocated: [45, 40] },
      { id: 5, name: 'Eli Nakamura', weeklyHours: 0, allocated: [20, 0] },
    ],
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** A PATCH response the test resolves by hand, to look at the grid while the save is in flight. */
function deferred() {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

// What the fake server has stored; GETs read it, a test writes to it when a save "lands".
let stored: CapacityResponse
let serverDown: boolean
let patchResponse: () => Promise<Response>
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  if (init?.method === 'PATCH') return patchResponse()
  if (serverDown) return json({ error: 'bad gateway' }, 502)
  if (url.startsWith('/api/capacity')) return json(stored)
  throw new Error(`unexpected request ${url}`)
})

beforeEach(() => {
  stored = capacity()
  serverDown = false
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockClear()
})

function renderGrid() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <CapacityGrid range={range} onRangeChange={() => {}} />
    </QueryClientProvider>,
  )
}

const row = (name: string) => screen.getByRole('row', { name: new RegExp(name) })

async function editWeeklyHours(name: string, value: string) {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: new RegExp(`Weekly hours for ${name}`) }))
  const input = screen.getByRole('textbox', { name: `Weekly hours for ${name}` })
  await user.clear(input)
  await user.type(input, `${value}{Enter}`)
  return user
}

describe('CapacityGrid', () => {
  it('marks weeks over capacity, including any allocation against zero hours', async () => {
    renderGrid()
    expect(await screen.findByText(/of 2 people are over capacity/)).toHaveTextContent(/^2 of 2 people/)
    expect(within(row('Dee Okafor')).getByText(/5 over capacity/)).toBeInTheDocument()
    expect(within(row('Eli Nakamura')).getByText(/hours, no capacity/)).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /5 Jan/ })).toHaveTextContent('2 over')
  })

  it('shows the new capacity straight away and keeps what the server stored', async () => {
    const save = deferred()
    patchResponse = () => save.promise
    renderGrid()

    await editWeeklyHours('Dee Okafor', '45')

    // Optimistic: 45 h allocated against 45 h is no longer over, before the server answers.
    expect(await within(row('Dee Okafor')).findByRole('status')).toHaveTextContent('Saving')
    expect(within(row('Dee Okafor')).queryByText(/over capacity/)).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/people/4', expect.objectContaining({ body: '{"weeklyHours":45}' }))

    stored.people[0] = { ...stored.people[0], weeklyHours: 45 }
    save.resolve(json({ id: 4, name: 'Dee Okafor', weeklyHours: 45 }))
    await waitFor(() => expect(within(row('Dee Okafor')).queryByRole('status')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Weekly hours for Dee Okafor: 45. Edit' })).toBeInTheDocument()
    // The background refetch after the save agrees with what's on screen.
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.startsWith('/api/capacity'))).toHaveLength(2))
    expect(within(row('Dee Okafor')).queryByText(/over capacity/)).not.toBeInTheDocument()
  })

  it('puts the old capacity back when a save fails and keeps what the manager typed', async () => {
    const save = deferred()
    patchResponse = () => save.promise
    renderGrid()

    await editWeeklyHours('Dee Okafor', '45')
    expect(within(row('Dee Okafor')).queryByText(/over capacity/)).not.toBeInTheDocument()

    // The server goes away: the save fails and so does the refetch that follows it,
    // so only the client-side rollback can put the grid right.
    serverDown = true
    save.resolve(json({ error: 'database unavailable' }, 500))

    expect(await screen.findByText(/Not saved/)).toHaveTextContent(
      'Not saved: the server had a problem (500). Still 40 h.',
    )
    expect(screen.getByRole('textbox', { name: 'Weekly hours for Dee Okafor' })).toHaveValue('45')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    // The grid shows what is actually stored: 40 h, so the 45 h week is over again.
    expect(within(row('Dee Okafor')).getByText(/5 over capacity/)).toBeInTheDocument()
    // Eli's row was never touched.
    expect(within(row('Eli Nakamura')).getByText(/hours, no capacity/)).toBeInTheDocument()
    expect(await screen.findByText(/Couldn’t refresh: bad gateway/)).toBeInTheDocument()
  })

  it('says a save may not have landed when the server never answered', async () => {
    patchResponse = () => Promise.reject(new TypeError('Failed to fetch'))
    renderGrid()

    await editWeeklyHours('Dee Okafor', '45')

    expect(await screen.findByText(/may not have been saved/)).toHaveTextContent(
      'Couldn’t reach the server, so this may not have been saved.',
    )
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('rejects an impossible value without calling the server', async () => {
    renderGrid()
    await editWeeklyHours('Dee Okafor', '200')
    expect(await screen.findByRole('alert')).toHaveTextContent('Must be between 0 and 168.')
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/people'), expect.anything())
  })

  it('accepts a decimal comma', async () => {
    patchResponse = async () => json({ id: 4, name: 'Dee Okafor', weeklyHours: 37.5 })
    renderGrid()
    await editWeeklyHours('Dee Okafor', '37,5')
    expect(fetchMock).toHaveBeenCalledWith('/api/people/4', expect.objectContaining({ body: '{"weeklyHours":37.5}' }))
  })

  it('cancels with Escape and returns focus to the cell', async () => {
    renderGrid()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Weekly hours for Dee Okafor/ }))
    await user.keyboard('9{Escape}')
    expect(screen.getByRole('button', { name: 'Weekly hours for Dee Okafor: 40. Edit' })).toHaveFocus()
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/people'), expect.anything())
  })
})
