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
