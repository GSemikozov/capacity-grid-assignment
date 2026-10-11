# Decisions

## What did the spec not tell you?

- **What a week is.** Monday–Sunday ISO weeks, keyed by the Monday's date (so the week of
  29 Dec 2025 being 2026-W01 doesn't matter). `from`/`to` are widened to whole weeks and the
  API echoes the widened range back.
- **Whether weekends count.** Assignments run through Saturday and Sunday. I count Mon–Fri
  only: `weekly_hours` reads as a five-day budget, and counting weekends makes a full-time
  person on a full-week assignment show 56/40.
- **What "over-allocated" means at zero capacity.** Any allocation over 0 h is over (Eli
  Nakamura: 20 h against 0). I show hours, not percentages, so there's no divide-by-zero.
- **How to keep the grid right after a save.** Optimistic update of that person in every
  cached range, rolled back for that person only if the save fails, then a background refetch
  once the last save settles. Allocation doesn't depend on capacity, so the PATCH response
  alone is enough for the edited numbers; the refetch is there because a failed response
  doesn't prove the write didn't land.
- **What a failed save looks like.** The grid goes back to the stored value, and the editor
  reopens with what the manager typed and a Retry button. An error response says "Not saved …
  Still 40 h."; no response at all says it *may not* have been saved, because it may have.
- **How wide a range can be.** The API allows 106 weeks; the UI renders up to 26. Thousands of
  people × two years needs pagination and row virtualisation, which I deferred.
- **History of capacity.** `weekly_hours` has no effective date, so an edit changes capacity
  for every past week too. I kept that and wrote it down instead of inventing a model.

## What did you notice that looked wrong?

- `hours_per_day` values of 0.125–1.0 looked like a fraction of a day. They're real hours split
  into 15 rows per assignment (14 × x + one 2x); the sum is 2/4/6/8 h/day. Deduplicating would
  have been the "obvious" fix and been wrong by 16×.
- Assignments continue through weekends with the same daily hours — see above.
- Eli Nakamura has 0 weekly hours but allocations.
- Dee Okafor has 11 h/day on 7–9 Jan 2026 (two overlapping projects): 45/40 that week.
- No holidays: 1 Jan 2026 counts as a working day. Left as is.
- Every third week is empty for all 500 people (e.g. 12 Jan 2026 has only the four hand-written
  rows). Assignments start every three weeks and last at most 13 days — a generator pattern, not
  a query bug. Left as is.

## What did the AI get wrong that you caught?

- The AI had already implemented "Range in the URL", but it was still listed as "Not done" in the worklog. It argued that the log shouldn't be edited because it was append-only. I asked it to fix that, because keeping the status accurate is more important.

- I also asked another AI to implement the same task independently, then compared both solutions using the actual tech stack. That helped catch a few issues the first AI had missed. Database errors weren't logged properly, the hours input used `type=number`, which caused some UX problems, and the error message after a failed save didn't tell the user what value was still saved. We ended up fixing all three.

- The comparison also showed that the second AI hadn't actually tested its database query because Docker wasn't available in its environment. I had it run against our Postgres database, and only then could we confirm it worked. We also discovered that every third week had no data for any of the 500 people. Neither AI had mentioned that before, so the cross-check was really useful.

## What would you do differently with a week?

- Effective-dated capacity (and time off / holidays) so an edit doesn't rewrite history.
- People pagination or team scoping in the API, plus row virtualisation in the grid.
- Handler tests for the query against a real Postgres in CI.
- Sorting, and an "over-allocated only" filter that keeps a row visible while it's being edited.
