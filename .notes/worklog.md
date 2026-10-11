# Worklog

Running notes on how this got built — decisions, assumptions, dead ends, and anything
left unfinished. Append as you go; a line or two per entry is right.

---

## Data, before writing anything

- `hours_per_day` max is 1.0 and most rows are 0.125–0.5, which looked like a fraction of a
  day. It isn't: every logical assignment is stored as 15 rows (14 × x plus one 2x), and
  summing them gives clean 2/4/6/8 h per day. So: sum every row, never `DISTINCT`. Deduping
  would report 0.5 h/day for a full-time assignment.
- Assignments run through weekends with the same hours. Counting Sat/Sun would make Ana
  (40 h/wk, one Mon–Sun assignment at 8 h/day) 56/40. Counting Mon–Fri gives 40/40. Went
  with weekdays only: `weekly_hours` reads as a Mon–Fri budget.
- Eli Nakamura has `weekly_hours = 0` but 20 h allocated in the week of 2026-01-05. Any
  allocation over zero capacity is over-allocated; no percentages, so no divide-by-zero.
- Dee Okafor has 11 h/day on 2026-01-07..09 (two overlapping projects) — the first real
  over-allocation in the default range (45/40).
- The week of 2025-12-29 is ISO 2026-W01. Weeks are keyed by their Monday date, never by
  week number, so the year boundary is a non-issue.
- No holidays in the model (2026-01-01 counts as a working day). Left as is.

## API

- Weeks are Monday–Sunday. `from`/`to` are inclusive and widened to whole weeks; the
  response echoes the widened range so the UI shows what was actually computed.
- Range capped at 106 weeks (two years + slack) → 400 beyond that. Bounds payload and query.
- Response is dense: `weeks[]` once, then `allocated[]` per person index-aligned to it.
  Keeps a 500 × 83-week payload at ~130 KB instead of repeating keys per cell.
- Verified the endpoint against an independent Python recomputation from `seed.sql`:
  41 500 person-weeks over the full data range, 0 mismatches.
- First query version expanded each assignment with a `LATERAL generate_series`. Correct,
  but the planner guessed 1000 rows per call, cost exploded, and JIT ate 230 of 303 ms on a
  3-week range. Joining assignments to a calendar of workdays in the range: 75 ms, and
  easier to read. Output byte-identical to the first version.
- PATCH returns the stored person. Allocation doesn't depend on `weekly_hours`, so the
  client can patch its cache with that response — no range refetch needed.
- `weekly_hours` has no history: changing it rewrites capacity for every past week too.
  That's what the schema supports; noted as a product gap rather than worked around.

## Web

- Added `@tanstack/react-query`: per-range cache, `keepPreviousData` so week navigation never
  blanks the grid, request abort on range change, optimistic mutation plumbing. Writing that
  by hand is where the bugs would be.
- The range lives in `App`, not the grid: the logged-time timeline that will sit beside this
  view should follow the same weeks.
- While a new range loads, the old one stays on screen dimmed, with "Loading X… still showing
  Y". Column headers come from the response, not from the props, so the old numbers are never
  shown under the new dates. Editing is paused during that window.
- UI caps a range at 26 weeks (API allows 106). 500 rows × 26 weeks renders fine; thousands of
  rows × two years would not without row virtualisation. Deferred.
- Save flow: optimistic patch of the person in every cached range → server value on success →
  on failure put back *that person's* previous capacity (a whole-cache snapshot restore would
  also undo someone else's in-flight edit) and reopen the editor with the typed value, the
  server's reason and a Retry button. After the last save settles, cached ranges are refetched
  in the background — a failed response doesn't prove the write didn't land.
- Verified in the browser: Dee 40→45 un-reds the 45 h week and drops the count 41→40; with
  `docker compose stop api` the save shows "Not saved: The server had a problem (502)", the
  grid goes back to 40, and a refresh banner says the numbers may be stale; Retry after
  `docker compose start api` saves.
- Found while testing: browser-native validation on `type=number` showed its own bubble instead
  of our message → `noValidate`. A validation error also labelled the button "Retry" → only a
  failed server save does now. After a failed save focus fell to `<body>` → it goes back into
  the editor if the manager was still on that cell.
- Found while testing: `onSettled` returned the refetch promise, so "Saving…" stayed up until the
  whole range had reloaded. Not awaited any more.
- The rollback test passed even with the rollback deleted — the follow-up refetch quietly fixed
  the number. Made the fake server go down for the refetch too (the real failure mode), and
  now the test fails without the rollback.
- Two "Retry" buttons (refresh banner + editor) were ambiguous to a screen reader; the banner's
  is "Reload capacity".
- Phone width: two pinned columns covered all weeks; below 640px only the name is pinned.

## Not done

- People pagination / team scoping in the API and row virtualisation in the grid. The
  endpoint returns the whole roster for the range.
- Effective-dated capacity (see API notes) and holidays / time off.
- Sorting, and an "over-allocated only" filter that keeps a row with an open edit (see below).
- No Go handler tests against a real database; the query was checked against an independent
  recomputation from the seed instead (see API notes).

## Data, second look

- Every third week is empty for all 500 people (2025-06-16, 07-07, 07-28 … 2026-01-12 has only
  the four hand-written rows). Assignments start on a Monday every three weeks and last at most
  13 days, so the third week never gets any. Reads as the seed generator's pattern, not a query
  bug: the per-person-week numbers still match the independent recomputation. Left as is.

## Cross-check against a second implementation

A parallel attempt (different session, its own branch, no Docker in its sandbox) was run here
against the same database on other ports, so its numbers were checked for the first time:

- Its API returns the same numbers as this one on five ranges (year boundary, both ends of the
  data, 26 weeks): 0 mismatches. Two independent queries agreeing is the best evidence I have
  that the weekday/sum-every-row reading is applied consistently.
- Taken from it, one commit each:
  - Log database errors in the API; skip requests the client already abandoned. Before, a
    failing query was a bare 500 with nothing in the logs.
  - Range in `?from=&to=` (previously deferred). `replaceState`, not `pushState`: a history
    entry per "Next week" click would bury Back. A bad or too-wide URL range falls back to the
    default.
  - Weekly hours in a text field with `inputMode="decimal"`, accepting "37,5". Replaces the
    `type=number` + `noValidate` fix above: no browser bubble, no scroll-wheel edits.
  - Failed-save wording: an error response means nothing changed → "Not saved: … Still 40 h."
    No response (offline, 504) means the write may have landed → "may not have been saved"; the
    post-save refetch then shows what's stored. A 5xx's message isn't shown — "could not save
    weekly hours" after "Not saved:" said nothing new.
  - "N over" per week in the column header; "no capacity" instead of "+20" for zero hours.
- Not taken:
  - "Only over-allocated" filter: saving someone out of over-allocation removed their row from
    under the editor — the confirmation vanished and focus fell to `<body>`. Reproduced in the
    browser. A filter needs to keep rows with an open or just-finished edit; deferred.
  - "Whole team" totals row: the sum of 500 people's hours isn't something a manager acts on.
  - Pessimistic save with the input disabled. Its argument (don't show an over-allocation
    disappearing and then coming back) is fair; I kept optimistic because the rollback is
    per-person and the failure is spelled out in place.
  - 26-week cap in the API and 80 h max weekly hours. Product calls; kept 106 weeks / 168 h.
- Also seen there: opening its editor doesn't select the value, so typing 36 over 40 gives
  "4036". This one selects on focus.

## Final run and review

- Clean run as a reviewer would do it: `docker compose down -v`, `make up`. Fresh seed, clean
  `npm install`, no console errors, API still matches the seed recomputation (0 mismatches).
- Code review of the branch; fixed, each with a test that fails without the fix:
  - Leaving the weekly-hours editor (Tab out, click elsewhere) saved and then pulled focus back
    to the cell's button. Focus now returns to the cell only on Enter/Save/Cancel/Escape.
    Reproduced in the browser before fixing.
  - A range that failed to load replaced the grid with a bare error box: placeholder data only
    lives while a query is pending. The last loaded range now stays on screen, dimmed and
    read-only, with what failed and a reload button. That fallback also covers "still loading",
    so `keepPreviousData` went — one rule for what's shown until the requested range arrives.
  - The optimistic update cancelled every capacity query, including the first load of a range
    the manager had just moved to; that range sat on "Loading" until a save settled. Only
    refetches of loaded ranges are cancelled now.
  - Rollback took the person's capacity from the first cached range and wrote it into all of
    them; now each range gets back its own previous value.
  - Tests for navigation: previous range shown while the next loads, and a late answer for a
    range the manager already left doesn't replace the current one.
- Server messages without a full stop ran into the next sentence ("…bad gateway The numbers…").
- Testing note: the in-app browser pane was hidden, and react-query pauses retries while the page
  is hidden, so a failed load there sat on "Loading…". Not a bug for a visible tab; the failure
  path is covered by tests with retries off.
- Found and left (noted, not fixed): one `useMutation` observer per row (fine at 500, worth one
  grid-level mutation at thousands); PATCH accepts trailing bytes after the JSON object; the
  "Saving…" live region mounts with its text, so some screen readers won't announce it; the two
  over-capacity counts walk the data separately; the hours parser rejects ".5" and "40.".
