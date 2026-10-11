import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type CapacityResponse, fetchCapacity, updateWeeklyHours } from './api'

const capacityRoot = ['capacity'] as const
const updateWeeklyHoursKey = ['updateWeeklyHours'] as const

export function capacityKey(from: string, to: string) {
  return [...capacityRoot, from, to] as const
}

/** Capacity for one range, cached per range. */
export function useCapacity(from: string, to: string) {
  return useQuery({
    queryKey: capacityKey(from, to),
    queryFn: ({ signal }) => fetchCapacity(from, to, signal),
  })
}

type UpdateVariables = { id: number; weeklyHours: number }

/**
 * Saves a person's weekly hours.
 *
 * - Optimistic: every cached range shows the new capacity immediately, so
 *   over-allocation recolours as soon as the manager hits Enter.
 * - On failure, only that person's capacity is put back — not a whole-cache
 *   snapshot, which would also undo other people's in-flight edits.
 * - On success, the value the server stored is written into the cache.
 * - Either way, once the last save settles the cached ranges are refetched.
 *   Allocation doesn't depend on capacity, so this isn't needed for the edited
 *   number; it reconciles anything else (a failed response whose write did
 *   land, edits by someone else, refetches cancelled by the optimistic update,
 *   a first load that read the old value before the write committed).
 */
export function useUpdateWeeklyHours() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: updateWeeklyHoursKey,
    mutationFn: ({ id, weeklyHours }: UpdateVariables) => updateWeeklyHours(id, weeklyHours),
    onMutate: async ({ id, weeklyHours }) => {
      // A refetch already in flight would land with the old value and
      // overwrite the optimistic one. A range's first load has nothing to
      // overwrite, so let it finish: cancelling it would leave that range
      // unloaded until a save settles. onSuccess patches it once it's there.
      await queryClient.cancelQueries({
        queryKey: capacityRoot,
        predicate: (query) => query.state.data !== undefined,
      })
      const previous = cachedWeeklyHours(queryClient, id)
      setCachedWeeklyHours(queryClient, id, weeklyHours)
      return { previous }
    },
    onError: (_error, { id }, context) => {
      if (context?.previous !== undefined) setCachedWeeklyHours(queryClient, id, context.previous)
    },
    onSuccess: (person) => {
      setCachedWeeklyHours(queryClient, person.id, person.weeklyHours)
    },
    onSettled: () => {
      // Refetching while another save is still in flight would briefly show
      // that person's old value; the last save to settle does it for all.
      // Not awaited: the save is done when the server answers, the refetch runs behind it.
      if (queryClient.isMutating({ mutationKey: updateWeeklyHoursKey }) === 1) {
        void queryClient.invalidateQueries({ queryKey: capacityRoot })
      }
    },
  })
}

function cachedWeeklyHours(queryClient: QueryClient, id: number): number | undefined {
  for (const [, data] of queryClient.getQueriesData<CapacityResponse>({ queryKey: capacityRoot })) {
    const person = data?.people.find((p) => p.id === id)
    if (person) return person.weeklyHours
  }
  return undefined
}

function setCachedWeeklyHours(queryClient: QueryClient, id: number, weeklyHours: number) {
  queryClient.setQueriesData<CapacityResponse>({ queryKey: capacityRoot }, (data) =>
    data
      ? {
          ...data,
          // Untouched rows keep their identity, so memoised rows don't re-render.
          people: data.people.map((p) => (p.id === id ? { ...p, weeklyHours } : p)),
        }
      : data,
  )
}
