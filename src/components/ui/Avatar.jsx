import { TOPBAR_GRADIENT } from '@routes/navItems'

export default function Avatar({ user, size = 32 }) {
  const style = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.35),
    background: user.profile_img_url ? undefined : TOPBAR_GRADIENT[user.role] || TOPBAR_GRADIENT.patient,
  }
  return (
    <div className="avatar" style={style}>
      {user.profile_img_url ? <img src={user.profile_img_url} alt={user.avatar_initials} /> : user.avatar_initials}
    </div>
  )
}
