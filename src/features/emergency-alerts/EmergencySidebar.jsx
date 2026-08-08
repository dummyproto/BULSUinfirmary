import { useState } from 'react'
import SearchableSelect from '@components/ui/SearchableSelect'
import { SMS_TEMPLATES } from './lib/smsHelpers'
import { EmergencyIcon, ClipboardIcon, PhoneIcon, MessageSquareIcon, UserIcon, AlertTriangleIcon, RefreshCwIcon, ChevronDownIcon } from '@components/ui/icons'

export const EMERGENCY_TABS = [
  { key: 'list', label: 'Active Alerts', Icon: EmergencyIcon },
  { key: 'log', label: 'Alert Log', Icon: ClipboardIcon },
  { key: 'composer', label: 'Notify Parent', Icon: PhoneIcon },
  { key: 'smslog', label: 'SMS Log', Icon: MessageSquareIcon },
]

export const PICKUP_OPTIONS = [
  { value: 'none', label: 'No pickup needed', sub: 'Just informing parent/guardian' },
  { value: 'pickup', label: 'Parent must pick up', sub: 'Patient needs to be picked up from school' },
  { value: 'sendhome', label: 'Sending patient home', sub: 'Patient will be sent home early' },
]

/**
 * Every sidebar section (Alert Management, and — on the Notify Parent
 * tab — Select Patient/Message Templates/Pickup Instructions) is now a
 * collapsible dropdown, same interaction pattern as Topbar.jsx's
 * profile dropdown: click the title, chevron rotates, content fades in.
 * Extracted once here instead of repeating the toggle/chevron/fade JSX
 * four separate times below.
 */
function SidebarDropdownSection({ title, stepNum, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="sms-sidebar-section">
      <button type="button" className="emg-sidebar-dropdown-title" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>
          {stepNum && <span className="sms-sidebar-step-num">{stepNum}</span>} {title}
        </span>
        <ChevronDownIcon width={14} height={14} className={`emg-sidebar-dropdown-chevron${open ? ' open' : ''}`} />
      </button>
      {open && <div className="emg-sidebar-dropdown-body">{children}</div>}
    </div>
  )
}

export default function EmergencySidebar({
  tab,
  onTabChange,
  activeCount,
  patients,
  patientId,
  patient,
  primaryPhoneValid,
  manualPhone,
  onManualPhoneChange,
  manualPhoneValid,
  onSelectStudent,
  situation,
  onSelectSituation,
  pickupFlag,
  onSelectPickup,
  onReset,
}) {
  const tabItems = EMERGENCY_TABS.map((t) => (t.key === 'list' && activeCount > 0 ? { ...t, label: `${t.label} (${activeCount})` } : t))
  const options = patients.map((p) => ({ value: String(p.user_id), label: p.name, sub: `${p.student_number} \u00b7 ${p.year_level}` }))

  return (
    <div className="sms-chat-sidebar">
      <SidebarDropdownSection title="Alert Management">
        <div className="emg-sidebar-nav">
          {tabItems.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`emg-sidebar-nav-item${tab === t.key ? ' active' : ''}`}
              onClick={() => onTabChange(t.key)}
            >
              <t.Icon width={15} height={15} /> {t.label}
            </button>
          ))}
        </div>
      </SidebarDropdownSection>

      {tab === 'composer' && (
        <>
          <SidebarDropdownSection title="Select Patient" stepNum={1}>
            <SearchableSelect
              options={options}
              value={patientId}
              displayValue={patient?.name || ''}
              onSelect={onSelectStudent}
              onClear={() => onSelectStudent('')}
              placeholder="Search patient by name or ID…"
              emptyLabel="No patients found"
            />
            {patient && (
              <div className={`sms-parent-info-box${primaryPhoneValid ? '' : ' needs-manual-phone'}`}>
                {patient.parent_name && (
                  <div>
                    <UserIcon width={12} height={12} style={{ verticalAlign: -1 }} /> <strong>{patient.parent_name}</strong> ({patient.parent_relation})
                  </div>
                )}
                {primaryPhoneValid ? (
                  <div>
                    <PhoneIcon width={11} height={11} style={{ verticalAlign: -1 }} /> {patient.parent_phone}
                    {patient.parent_phone2 ? ` / ${patient.parent_phone2}` : ''}
                  </div>
                ) : (
                  <>
                    <div className="phone-status invalid" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <AlertTriangleIcon width={12} height={12} />
                      {patient.parent_name ? 'Number on file isn\u2019t a valid PH mobile number' : 'No parent/guardian contact on file for this patient'}
                    </div>
                    <div className="sms-manual-phone-field">
                      <label htmlFor="sms-manual-phone">Receiver's number (this message only)</label>
                      <input
                        id="sms-manual-phone"
                        type="tel"
                        inputMode="numeric"
                        maxLength={11}
                        className="form-input"
                        placeholder="e.g. 0917 123 4567"
                        value={manualPhone}
                        onChange={(e) => onManualPhoneChange(e.target.value.replace(/\D/g, '').slice(0, 11))}
                      />
                      {manualPhone && !manualPhoneValid && (
                        <div className="phone-status invalid" style={{ fontSize: 13, marginTop: 6 }}>Not a valid PH mobile number</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </SidebarDropdownSection>

          <SidebarDropdownSection title="Message Templates" stepNum={2}>
            <div className="sms-template-list">
              {SMS_TEMPLATES.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  className={`sms-template-list-item${situation === t.id ? ' selected' : ''}`}
                  style={{ '--tpl-color': t.color }}
                  onClick={() => onSelectSituation(t.id)}
                >
                  <span className="tpl-icon"><t.Icon width={18} height={18} /></span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </SidebarDropdownSection>

          <SidebarDropdownSection title="Pickup Instructions" stepNum={3}>
            <div className="pickup-options">
              {PICKUP_OPTIONS.map((o) => (
                <label className={`pickup-option${pickupFlag === o.value ? ' selected' : ''}`} key={o.value}>
                  <input
                    type="radio"
                    className="pickup-radio"
                    name="pickupFlag"
                    checked={pickupFlag === o.value}
                    onChange={() => onSelectPickup(o.value)}
                  />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{o.label}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{o.sub}</div>
                  </div>
                </label>
              ))}
            </div>
          </SidebarDropdownSection>

          <button type="button" className="btn btn-outline sms-sidebar-clear-btn" onClick={onReset}>
            <RefreshCwIcon width={13} height={13} /> Clear Everything
          </button>
        </>
      )}
    </div>
  )
}