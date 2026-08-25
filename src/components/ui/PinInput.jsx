import { useEffect, useRef, useState } from 'react'

// How long a just-typed digit stays visible before masking back to a dot.
const REVEAL_MS = 1000

/**
 * Numeric PIN field that mirrors the "show the digit you just typed for a
 * moment, then mask it" behavior used by iOS/Android system PIN entry.
 *
 * A plain `type="password"` input masks every character the instant it's
 * typed, with zero feedback on whether the key that landed was actually
 * the one intended — a wrong digit or a double-tap only surfaces once the
 * whole PIN turns out incorrect. This briefly shows each digit as it's
 * typed, then masks it back to a dot on its own, so a mistyped digit is
 * visible — and fixable — immediately instead of only after a failed
 * submit.
 *
 * Implementation note: rather than juggling the real input's own value
 * (which would fight the browser's native caret/selection/paste/mobile
 * numeric-keyboard handling), the real input stays fully in control of
 * typing as normal — it's just rendered invisible (`color: transparent`,
 * caret hidden the same way) — and a `pointer-events: none` overlay
 * directly on top of it renders the dot/digit display. Both elements
 * share the same CSS class so padding/border/font sizing (including the
 * mobile breakpoint overrides in legacy.css) line up automatically.
 */
export default function PinInput({
  id,
  value,
  onChange,
  length = 4,
  autoFocus = false,
  hasError = false,
  inputClassName = 'form-input',
  textColor = '#1A1310',
  fontSize = 18,
  required = false,
}) {
  const [revealIndex, setRevealIndex] = useState(-1)
  const timeoutRef = useRef(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  function handleChange(e) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, length)
    // `value` here is still the previous committed value — React hasn't
    // re-rendered with the new one yet at the point this fires — so
    // comparing lengths against it is enough to tell "a digit was added"
    // from "one was deleted" without needing a separate ref or effect
    // (and it stays correct even when the field is reset from OUTSIDE a
    // keystroke, e.g. cleared after a wrong-PIN attempt, since there's
    // nothing here relying on remembered state to get out of sync with).
    const grew = digits.length > value.length

    if (timeoutRef.current) clearTimeout(timeoutRef.current)

    if (grew) {
      // A digit was just added (typed, autofilled, or pasted) — reveal
      // only that newest position, matching the "one digit at a time"
      // native PIN-pad behavior, then mask it after REVEAL_MS.
      setRevealIndex(digits.length - 1)
      timeoutRef.current = setTimeout(() => setRevealIndex(-1), REVEAL_MS)
    } else {
      // Backspace/delete — nothing new to reveal.
      setRevealIndex(-1)
    }

    onChange(digits)
  }

  const sharedFieldStyle = {
    letterSpacing: 8,
    fontSize,
    textAlign: 'center',
    fontVariantNumeric: 'tabular-nums',
  }

  const displayText = value
    .split('')
    .map((digit, i) => (i === revealIndex ? digit : '•'))
    .join('')

  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={length}
        className={inputClassName}
        placeholder={'•'.repeat(length)}
        value={value}
        onChange={handleChange}
        onBlur={() => {
          // Don't leave a digit sitting visible if the person taps/clicks
          // away mid-reveal.
          if (timeoutRef.current) clearTimeout(timeoutRef.current)
          setRevealIndex(-1)
        }}
        autoFocus={autoFocus}
        required={required}
        style={{
          ...sharedFieldStyle,
          // Hides the real characters — the overlay below is what's
          // actually seen — while keeping every other native behavior
          // (typing, backspace, selection, paste, numeric keypad on
          // mobile) completely unmodified.
          color: 'transparent',
          caretColor: textColor,
          ...(hasError ? { borderColor: '#EF4444' } : {}),
        }}
      />
      {value.length > 0 && (
        <div
          aria-hidden="true"
          className={inputClassName}
          style={{
            ...sharedFieldStyle,
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: '1px solid transparent',
            boxShadow: 'none',
            color: textColor,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          {displayText}
        </div>
      )}
    </div>
  )
}