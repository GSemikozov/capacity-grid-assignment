package main

import (
	"testing"
)

func TestParseWeekRange(t *testing.T) {
	tests := []struct {
		name, from, to      string
		wantFirst, wantLast string
		wantErr             bool
	}{
		{name: "aligned to Mondays", from: "2026-01-05", to: "2026-01-12", wantFirst: "2026-01-05", wantLast: "2026-01-12"},
		{name: "mid-week dates widen to whole weeks", from: "2026-01-07", to: "2026-01-16", wantFirst: "2026-01-05", wantLast: "2026-01-12"},
		{name: "Sunday belongs to the week before", from: "2026-01-11", to: "2026-01-11", wantFirst: "2026-01-05", wantLast: "2026-01-05"},
		{name: "week across the year boundary", from: "2026-01-01", to: "2026-01-01", wantFirst: "2025-12-29", wantLast: "2025-12-29"},
		{name: "two years is allowed", from: "2025-01-06", to: "2026-12-31", wantFirst: "2025-01-06", wantLast: "2026-12-28"},
		{name: "missing to", from: "2026-01-05", wantErr: true},
		{name: "bad format", from: "05/01/2026", to: "2026-01-12", wantErr: true},
		{name: "reversed", from: "2026-01-12", to: "2026-01-05", wantErr: true},
		{name: "too long", from: "2024-01-01", to: "2026-12-31", wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			first, last, err := parseWeekRange(tt.from, tt.to)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected an error, got %v–%v", first, last)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got := first.Format(dateLayout); got != tt.wantFirst {
				t.Errorf("first = %s, want %s", got, tt.wantFirst)
			}
			if got := last.Format(dateLayout); got != tt.wantLast {
				t.Errorf("last = %s, want %s", got, tt.wantLast)
			}
		})
	}
}

func TestValidateWeeklyHours(t *testing.T) {
	f := func(v float64) *float64 { return &v }
	for _, ok := range []*float64{f(0), f(37.5), f(168)} {
		if msg := validateWeeklyHours(ok); msg != "" {
			t.Errorf("%v rejected: %s", *ok, msg)
		}
	}
	for _, bad := range []*float64{nil, f(-1), f(168.5)} {
		if validateWeeklyHours(bad) == "" {
			t.Errorf("%v accepted", bad)
		}
	}
}
