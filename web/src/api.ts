export type PersonCapacity = {
  id: number
  name: string
  weeklyHours: number
  /** Hours allocated per week, index-aligned with CapacityResponse.weeks. */
  allocated: number[]
}

export type CapacityResponse = {
  /** The requested range, widened by the API to whole Monday–Sunday weeks. */
  from: string
  to: string
  /** The Monday of each week in the range, ascending. */
  weeks: string[]
  people: PersonCapacity[]
}

export type Person = {
  id: number
  name: string
  weeklyHours: number
}

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function fetchCapacity(from: string, to: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ from, to })
  return request<CapacityResponse>(`/api/capacity?${params}`, { signal })
}

export function updateWeeklyHours(id: number, weeklyHours: number) {
  return request<Person>(`/api/people/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weeklyHours }),
  })
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch (error) {
    if (init.signal?.aborted) throw error
    throw new ApiError('Could not reach the server. Check your connection.', 0)
  }
  if (!response.ok) {
    throw new ApiError(await errorMessage(response), response.status)
  }
  return (await response.json()) as T
}

async function errorMessage(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null)
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
    return body.error
  }
  return response.status >= 500
    ? `The server had a problem (${response.status}).`
    : `Request failed (${response.status}).`
}
