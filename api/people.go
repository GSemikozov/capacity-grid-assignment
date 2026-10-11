package main

import (
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"
)

const maxWeeklyHours = 168

type person struct {
	ID          int     `json:"id"`
	Name        string  `json:"name"`
	WeeklyHours float64 `json:"weeklyHours"`
}

type updatePersonRequest struct {
	WeeklyHours *float64 `json:"weeklyHours"`
}

// handleUpdatePerson serves PATCH /api/people/{id} with {"weeklyHours": n}.
//
// It returns the person as stored, so the client can reconcile its cache with
// the value the server actually accepted. Allocation does not depend on
// weekly hours, so nothing else in the capacity response changes.
func (s *server) handleUpdatePerson(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id <= 0 {
		writeError(w, http.StatusBadRequest, "id must be a positive integer")
		return
	}

	var req updatePersonRequest
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "body must be JSON like {\"weeklyHours\": 40}")
		return
	}
	if msg := validateWeeklyHours(req.WeeklyHours); msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}

	var p person
	err = s.db.QueryRow(r.Context(), `
		UPDATE people SET weekly_hours = $1
		WHERE id = $2
		RETURNING id, name, weekly_hours::float8
	`, *req.WeeklyHours, id).Scan(&p.ID, &p.Name, &p.WeeklyHours)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "person not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not save weekly hours")
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func validateWeeklyHours(h *float64) string {
	switch {
	case h == nil:
		return "weeklyHours is required"
	case math.IsNaN(*h) || *h < 0 || *h > maxWeeklyHours:
		return "weeklyHours must be between 0 and 168"
	}
	return ""
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
