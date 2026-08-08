import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDelayedUnmount } from '@hooks/useDelayedUnmount'
import { CameraIcon, TrashIcon } from '@components/ui/icons'

/**
 * Wraps the profile avatar circle (passed as `children`) and turns a
 * click on it into a dropdown menu instead of immediately opening the
 * file picker — previously the avatar itself opened the file picker
 * directly, with photo removal handled by a separate, easy-to-miss ×
 * badge hanging off the circle's edge. This combines both into one
 * "Add Photo" / "Change Photo" + "Remove Photo" menu.
 *
 * The menu portals to document.body (same technique
 * StatusFilterDropdown.jsx uses, for the same reason): every page
 * renders inside .main-area, which combines overflow:hidden with its
 * own position:relative + z-index, sealing off a stacking context that
 * traps any normally-positioned descendant behind page content further
 * down (here, the Personal Info card right below the avatar) no matter
 * how high its z-index is set.
 *
 *   hasImage: whether the user currently has a profile photo
 *   onAdd(): opens the file picker (same handler as before, for both
 *            the empty and has-photo case — "Add" vs "Change" is just
 *            a label difference)
 *   onRemove(): clears the current photo
 */
export default function AvatarMenu({ hasImage, onAdd, onRemove, children }) {
  const [open, setOpen] = useState(false)
  const [menuRect, setMenuRect] = useState(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const { shouldRender: showMenu, closing: menuClosing } = useDelayedUnmount(open, 120)

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return undefined
    function updateRect() {
      const r = triggerRef.current.getBoundingClientRect()
      setMenuRect({ top: r.bottom + 8, left: r.left })
    }
    updateRect()
    window.addEventListener('scroll', updateRect, true)
    window.addEventListener('resize', updateRect)
    return () => {
      window.removeEventListener('scroll', updateRect, true)
      window.removeEventListener('resize', updateRect)
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    function handleOutside(e) {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        menuRef.current && !menuRef.current.contains(e.target)
      ) {
        setOpen(false)
      }
    }
    function handleEscape(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  function handleAdd() {
    setOpen(false)
    onAdd()
  }

  function handleRemove() {
    setOpen(false)
    onRemove()
  }

  return (
    <>
      <div
        ref={triggerRef}
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={hasImage ? 'Change or remove profile photo' : 'Add profile photo'}
        title={hasImage ? 'Click to change or remove photo' : 'Click to add a photo'}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOpen((o) => !o))}
      >
        {children}
      </div>
      {showMenu && menuRect &&
        createPortal(
          <div
            ref={menuRef}
            className={`avatar-menu${menuClosing ? ' closing' : ''}`}
            role="menu"
            style={{ top: menuRect.top, left: menuRect.left }}
          >
            <button type="button" role="menuitem" className="avatar-menu-item" onClick={handleAdd}>
              <CameraIcon width={14} height={14} /> {hasImage ? 'Change Photo' : 'Add Photo'}
            </button>
            {hasImage && (
              <button type="button" role="menuitem" className="avatar-menu-item avatar-menu-item-danger" onClick={handleRemove}>
                <TrashIcon width={14} height={14} /> Remove Photo
              </button>
            )}
          </div>,
          document.body
        )}
    </>
  )
}