// MediBot's mascot face — a friendly rounded-helmet robot (ear pods,
// antenna with a medical cross, glowing screen-face, heart accent),
// matching the reference art the clinic team supplied. Unlike the rest
// of this app's icon set (single-color, currentColor-driven), this one
// is deliberately multi-color to keep the mascot's actual character —
// it's a face, not a glyph.
//
// Two states, both purely CSS-driven (no JS timers):
//   idle    — eyes blink periodically, mouth is a calm closed smile.
//   talking — while MediBot is actively composing/sending a reply, the
//             mouth animates open-and-closed on a quick loop (a talking
//             cue) instead of the static smile. Driven by the `talking`
//             prop, which callers tie to the existing `typing` state —
//             no new state introduced, this only changes how existing
//             state is drawn.
export default function BotFace({ size = 26, talking = false, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={`bot-face${talking ? ' bot-face-talking' : ''}${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    >
      <line x1="50" y1="16" x2="50" y2="26" stroke="#7FA8C9" strokeWidth="3" strokeLinecap="round" />
      <circle cx="50" cy="12" r="8" fill="#EAF4FC" stroke="#2B4A63" strokeWidth="2.5" />
      <path d="M50 8v8M46 12h8" stroke="#4A90C2" strokeWidth="2.2" strokeLinecap="round" />

      <ellipse cx="16" cy="55" rx="7" ry="9" fill="#F0A857" stroke="#2B4A63" strokeWidth="2.5" />
      <ellipse cx="84" cy="55" rx="7" ry="9" fill="#F0A857" stroke="#2B4A63" strokeWidth="2.5" />

      <rect x="21" y="26" width="58" height="56" rx="24" fill="#EAF4FC" stroke="#2B4A63" strokeWidth="3" />

      <path d="M36 34 Q50 27 64 34 L64 44 Q50 40 36 44 Z" fill="#BFE0F5" stroke="#2B4A63" strokeWidth="2" />
      <path
        d="M50 35.5 c-1.6-2.2-5.6-1.6-5.6 1.4 0 2.6 5.6 6.1 5.6 6.1s5.6-3.5 5.6-6.1c0-3-4-3.6-5.6-1.4Z"
        fill="#F0A857"
      />

      <rect x="27" y="40" width="46" height="38" rx="17" fill="#1E2A38" stroke="#2B4A63" strokeWidth="2.5" />

      <g className="bot-eye-group">
        <path className="bot-eye" d="M36 55 Q40.5 49 45 55" stroke="#6FE0F5" strokeWidth="3.4" strokeLinecap="round" fill="none" />
        <path className="bot-eye bot-eye-right" d="M55 55 Q59.5 49 64 55" stroke="#6FE0F5" strokeWidth="3.4" strokeLinecap="round" fill="none" />
      </g>

      <path className="bot-mouth-smile" d="M40 65 Q50 71 60 65" stroke="#6FE0F5" strokeWidth="3.2" strokeLinecap="round" fill="none" />
      <ellipse className="bot-mouth-talk" cx="50" cy="66" rx="8" ry="5" fill="#6FE0F5" />
    </svg>
  )
}