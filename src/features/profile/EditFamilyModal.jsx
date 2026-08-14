import { useState } from 'react'
import Modal from '@components/ui/Modal'
import { RELATIONS } from './lib/profileHelpers'
import { UserIcon, PeopleIcon, SaveIcon } from '@components/ui/icons'

const SECTION_CONFIG = {
  father: { title: "Edit Father's Information", Icon: UserIcon, nameLabel: 'FULL NAME', namePlaceholder: 'e.g. Juan dela Cruz Sr.', hasRelation: false },
  mother: { title: "Edit Mother's Information", Icon: UserIcon, nameLabel: 'FULL NAME', namePlaceholder: 'e.g. Maria dela Cruz', hasRelation: false },
  guardian: { title: 'Edit Guardian Information', Icon: PeopleIcon, nameLabel: 'FULL NAME', namePlaceholder: 'e.g. Carlos dela Cruz', hasRelation: true },
}

export default function EditFamilyModal({ isOpen, section, initial, onClose, onSave }) {
  const [form, setForm] = useState(() => {
    const base = initial || { name: '', phone: '', address: '', relation: '' }
    if (base.relation && !RELATIONS.includes(base.relation)) {
      return { ...base, relation: 'Other', relationOther: base.relation }
    }
    return { ...base }
  })
  const config = section ? SECTION_CONFIG[section] : null
  if (!isOpen || !config) return null
  const setField = (field) => (val) => setForm((f) => ({ ...f, [field]: val }))

  // "Other" is a dropdown placeholder, not a real relationship — swap in
  // whatever was typed into the free-text box instead. relationOther is
  // UI-only bookkeeping and is deliberately left out of what gets saved.
  function handleSave() {
    const { relationOther, ...rest } = form
    const relation = form.relation === 'Other' ? (relationOther || '').trim() : form.relation
    onSave(section, { ...rest, relation })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={config.title}
      icon={<config.Icon width={16} height={16} />}
      actions={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-blue" onClick={handleSave}>
            <SaveIcon width={13} height={13} /> Save Changes
          </button>
        </>
      }
    >
      <div className="form-grid" style={{ gap: 10 }}>
        <div className="form-group full">
          <label>{config.nameLabel}</label>
          <input
            className="form-input"
            placeholder={config.namePlaceholder}
            maxLength={100}
            value={form.name}
            onChange={(e) => setField('name')(e.target.value.replace(/[^A-Za-z\u00C0-\u00FF '-]/g, '').slice(0, 100))}
          />
        </div>
        {config.hasRelation && (
          <div className="form-group">
            <label>RELATIONSHIP</label>
            <select className="form-select" value={form.relation} onChange={(e) => setField('relation')(e.target.value)}>
              <option value="">-- Select --</option>
              {RELATIONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            {form.relation === 'Other' && (
              <input
                className="form-input"
                style={{ marginTop: 6 }}
                placeholder="Specify relationship"
                maxLength={30}
                value={form.relationOther || ''}
                onChange={(e) => setField('relationOther')(e.target.value.slice(0, 30))}
              />
            )}
          </div>
        )}
        <div className="form-group">
          <label>CONTACT NUMBER</label>
          <input
  className="form-input"
  placeholder="09XXXXXXXXX"
  inputMode="numeric"
  maxLength={11}
  value={form.phone}
  onChange={(e) => setField('phone')(e.target.value.replace(/\D/g, '').slice(0, 11))}
/>
        </div>
        <div className="form-group full">
          <label>ADDRESS</label>
          <input className="form-input" placeholder="House No., Street, Barangay, City" value={form.address} onChange={(e) => setField('address')(e.target.value)} />
        </div>
      </div>
    </Modal>
  )
}