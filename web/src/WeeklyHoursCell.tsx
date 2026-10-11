import { type FocusEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'
import type { Person } from './api'
import { formatHours } from './format'
import { useUpdateWeeklyHours } from './useCapacity'

const MAX_WEEKLY_HOURS = 168

type Props = {
  person: Person
  /** Editing is paused while the grid shows a previous range. */
  disabled: boolean
}

type Editor = {
  value: string
  error?: string
  /** The server rejected or never answered this value; the submit button retries it. */
  failedSave?: boolean
  /** Take focus when the manager opened the editor, or when they're still on this cell as a save fails. */
  autoFocus: boolean
}

// WeeklyHoursCell shows a person's capacity and lets the manager edit it in place.
// Enter or leaving the field saves, Escape cancels. A failed save reopens the
// editor with the attempted value and the reason, so nothing typed is lost.
export function WeeklyHoursCell({ person, disabled }: Props) {
  const mutation = useUpdateWeeklyHours()
  const [editor, setEditor] = useState<Editor | null>(null)
  const errorId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)

  useEffect(() => {
    if (editor === null && restoreFocus.current) {
      restoreFocus.current = false
      buttonRef.current?.focus()
    }
  }, [editor])

  const saving = mutation.isPending
  const locked = disabled || saving

  function open() {
    if (locked) return
    setEditor({ value: String(person.weeklyHours), autoFocus: true })
  }

  function close() {
    restoreFocus.current = true
    setEditor(null)
  }

  function save() {
    if (!editor) return
    const parsed = parseWeeklyHours(editor.value)
    if (typeof parsed === 'string') {
      setEditor({ ...editor, error: parsed })
      return
    }
    close()
    if (parsed === person.weeklyHours) return
    mutation.mutate(
      { id: person.id, weeklyHours: parsed },
      {
        onError: (error) =>
          setEditor({
            value: String(parsed),
            error: `Not saved: ${error.message}`,
            failedSave: true,
            // Keep a keyboard user in place; don't pull focus from wherever they went next.
            autoFocus: document.activeElement === buttonRef.current,
          }),
      },
    )
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
  }

  function onBlur(event: FocusEvent<HTMLFormElement>) {
    // Moving between the input and its own buttons is not leaving the editor.
    if (event.currentTarget.contains(event.relatedTarget)) return
    // Don't resubmit a failed save or an invalid value just because focus moved on.
    if (editor?.error) return
    save()
  }

  if (editor) {
    return (
      <form
        className="hours-editor"
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
      >
        <input
          // Text, not number: no browser validation bubble in place of our message,
          // no value changed by the scroll wheel, and "37,5" works in comma locales.
          type="text"
          inputMode="decimal"
          aria-label={`Weekly hours for ${person.name}`}
          aria-invalid={editor.error ? true : undefined}
          aria-describedby={editor.error ? errorId : undefined}
          value={editor.value}
          onChange={(event) => setEditor({ ...editor, value: event.target.value, error: undefined, failedSave: false })}
          autoFocus={editor.autoFocus}
          onFocus={(event) => event.currentTarget.select()}
        />
        <button type="submit">{editor.failedSave ? 'Retry' : 'Save'}</button>
        <button type="button" onClick={close} aria-label="Cancel">
          ✕
        </button>
        {editor.error && (
          <p id={errorId} role="alert" className="hours-error">
            {editor.error}
          </p>
        )}
      </form>
    )
  }

  return (
    <span className="hours">
      <button
        ref={buttonRef}
        type="button"
        className="hours-button"
        onClick={open}
        // aria-disabled rather than disabled keeps focus on the button while it saves.
        aria-disabled={locked || undefined}
        aria-label={`Weekly hours for ${person.name}: ${formatHours(person.weeklyHours)}. Edit`}
      >
        {formatHours(person.weeklyHours)} h
      </button>
      {saving && (
        <span role="status" className="hours-saving">
          Saving…
        </span>
      )}
    </span>
  )
}

/** Returns the hours, or a message saying why the input isn't usable. */
export function parseWeeklyHours(raw: string): number | string {
  const trimmed = raw.trim()
  if (trimmed === '') return 'Enter weekly hours.'
  if (!/^\d+(?:[.,]\d+)?$/.test(trimmed)) return 'Enter a number, like 32 or 37.5.'
  const hours = Number(trimmed.replace(',', '.'))
  if (hours > MAX_WEEKLY_HOURS) return `Must be between 0 and ${MAX_WEEKLY_HOURS}.`
  return hours
}
