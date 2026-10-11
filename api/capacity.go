package main

import (
	"errors"
	"fmt"
	"net/http"
	"time"
)

const (
	dateLayout = "2006-01-02"
	// maxRangeWeeks bounds one request: two years of history plus a little slack.
	maxRangeWeeks = 106
)

type capacityResponse struct {
	// From and To are the requested range widened to whole Monday–Sunday weeks.
	From string `json:"from"`
	To   string `json:"to"`
	// Weeks holds the Monday of every week in the range, ascending.
	Weeks  []string         `json:"weeks"`
	People []personCapacity `json:"people"`
}

type personCapacity struct {
	ID          int     `json:"id"`
	Name        string  `json:"name"`
	WeeklyHours float64 `json:"weeklyHours"`
	// Allocated is hours allocated per week, index-aligned with Weeks.
	Allocated []float64 `json:"allocated"`
}

// Allocation counts weekdays only: assignments in the seed run through
// weekends, and capacity (weekly_hours) is a Monday–Friday budget.
//
// Every assignment row is summed as-is. The seed stores one logical
// assignment as many rows that add up to the real hours per day, so
// deduplicating them would understate allocation.
const capacityQuery = `
WITH weeks AS (
  SELECT w::date AS week_start
  FROM generate_series($1::date, $2::date, interval '1 week') AS w
),
workdays AS (
  SELECT d::date AS day
  FROM generate_series($1::date, $2::date + 6, interval '1 day') AS d
  WHERE extract(isodow FROM d) < 6
),
allocated AS (
  SELECT a.person_id,
         date_trunc('week', wd.day)::date AS week_start,
         sum(a.hours_per_day) AS hours
  FROM assignments a
  JOIN workdays wd ON wd.day BETWEEN a.start_date AND a.end_date
  WHERE a.start_date <= $2::date + 6
    AND a.end_date >= $1::date
  GROUP BY a.person_id, week_start
)
SELECT p.id,
       p.name,
       p.weekly_hours::float8,
       array_agg(coalesce(al.hours, 0)::float8 ORDER BY w.week_start)
FROM people p
CROSS JOIN weeks w
LEFT JOIN allocated al ON al.person_id = p.id AND al.week_start = w.week_start
GROUP BY p.id
ORDER BY p.name, p.id
`

// handleCapacity serves GET /api/capacity?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Both dates are inclusive and are widened to whole Monday–Sunday weeks.
// The response has one entry per person with one allocation per week.
func (s *server) handleCapacity(w http.ResponseWriter, r *http.Request) {
	first, last, err := parseWeekRange(r.URL.Query().Get("from"), r.URL.Query().Get("to"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	rows, err := s.db.Query(r.Context(), capacityQuery, first, last)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load capacity")
		return
	}
	defer rows.Close()

	people := []personCapacity{}
	for rows.Next() {
		var p personCapacity
		if err := rows.Scan(&p.ID, &p.Name, &p.WeeklyHours, &p.Allocated); err != nil {
			writeError(w, http.StatusInternalServerError, "could not load capacity")
			return
		}
		people = append(people, p)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "could not load capacity")
		return
	}

	var weeks []string
	for d := first; !d.After(last); d = d.AddDate(0, 0, 7) {
		weeks = append(weeks, d.Format(dateLayout))
	}

	writeJSON(w, http.StatusOK, capacityResponse{
		From:   first.Format(dateLayout),
		To:     last.AddDate(0, 0, 6).Format(dateLayout),
		Weeks:  weeks,
		People: people,
	})
}

// parseWeekRange parses inclusive from/to dates and returns the Mondays of
// the first and last week they touch.
func parseWeekRange(fromParam, toParam string) (first, last time.Time, err error) {
	if fromParam == "" || toParam == "" {
		return first, last, errors.New("from and to are required (YYYY-MM-DD)")
	}
	from, err := time.Parse(dateLayout, fromParam)
	if err != nil {
		return first, last, fmt.Errorf("from: expected YYYY-MM-DD, got %q", fromParam)
	}
	to, err := time.Parse(dateLayout, toParam)
	if err != nil {
		return first, last, fmt.Errorf("to: expected YYYY-MM-DD, got %q", toParam)
	}
	if to.Before(from) {
		return first, last, errors.New("to must not be before from")
	}

	first, last = startOfWeek(from), startOfWeek(to)
	if weeks := int(last.Sub(first).Hours()/24)/7 + 1; weeks > maxRangeWeeks {
		return first, last, fmt.Errorf("range spans %d weeks; at most %d are allowed", weeks, maxRangeWeeks)
	}
	return first, last, nil
}

// startOfWeek returns the Monday of t's ISO week.
func startOfWeek(t time.Time) time.Time {
	daysSinceMonday := (int(t.Weekday()) + 6) % 7
	return t.AddDate(0, 0, -daysSinceMonday)
}
