import { NavLink } from 'react-router-dom'
import { useAuth } from '@context/AuthContext'
import { NAV_ITEMS, ROLE_LABELS } from '@routes/navItems'
import { LogoutIcon, MenuIcon } from '@components/ui/icons'
import logo from '@/assets/logo.png'

export default function Sidebar({ collapsed, mobileOpen, onToggle, onNavigate }) {
  const { role, signOut } = useAuth()
const items = NAV_ITEMS[role] || []

  const classes = ['sidebar', collapsed ? 'collapsed' : '', mobileOpen ? 'mobile-open' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <aside className={classes} id="main-sidebar">
      <div className="sidebar-logo">
        <div className="logo-mark" style={{ background: 'transparent', padding: 0, width: 36, height: 36 }}>
          <img src={logo} alt="Logo" style={{ width: '120%', height: '120%', objectFit: 'contain' }} />
        </div>
        <div className="sidebar-logo-text">
          <h2>Bulsu Infirmary</h2>
          <p>{ROLE_LABELS[role]}</p>
        </div>
        <button
          className="sidebar-close-btn"
          onClick={onToggle}
          title="Close sidebar"
          aria-label="Close sidebar"
          type="button"
        >
          <MenuIcon strokeWidth={2.5} />
        </button>
      </div>

      <nav className="sidebar-nav">
        {items.map((item) => (
          <NavLink
            key={item.key}
            to={item.path}
            className={({ isActive }) =>
              `nav-item${isActive ? ' active' : ''}${item.emg ? ' nav-item-emg' : ''}`
            }
            data-label={item.label}
            onClick={onNavigate}
          >
            <span className="nav-icon" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <item.icon />
            </span>
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button type="button" className="nav-item logout-item" onClick={signOut}>
          <span className="nav-icon">
            <LogoutIcon />
          </span>
          <span className="nav-label">Logout</span>
        </button>
      </div>
    </aside>
  )
}
