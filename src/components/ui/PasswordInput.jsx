import { useState } from 'react'
import { EyeIcon, EyeOffIcon } from './icons'

/**
 * Drop-in replacement for `<input type="password">` with a show/hide
 * toggle. Visibility state is local to each instance, so multiple
 * password fields in the same form (e.g. New Password + Confirm Password)
 * toggle independently.
 *
 * The three *ClassName props let each form keep its own exact existing
 * styling (login vs. registration vs. generic modal inputs already have
 * their own CSS in legacy.css) — this component only centralizes the
 * show/hide *behavior*, not visual styling, per the project's existing
 * per-context class conventions.
 */
export default function PasswordInput({
  wrapperClassName = 'pw-wrapper',
  inputClassName = 'form-input',
  toggleClassName = 'pw-toggle',
  iconSize = 15,
  ...inputProps
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div className={wrapperClassName}>
      <input {...inputProps} type={visible ? 'text' : 'password'} className={inputClassName} />
      <button
        type="button"
        className={toggleClassName}
        tabIndex={-1}
        aria-label={visible ? 'Hide password' : 'Show password'}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <EyeOffIcon width={iconSize} height={iconSize} /> : <EyeIcon width={iconSize} height={iconSize} />}
      </button>
    </div>
  )
}
