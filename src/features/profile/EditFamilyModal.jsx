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
  const [form, setForm] = useState(initial || { name: '', phone: '', address: '', relation: '' })
  const config = section ? SECTION_CONFIG[section] : null
  if (!isOpen || !config) return null
  const setField = (field) => (val) => setForm((f) => ({ ...f, [field]: val }))

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
          <button type="button" className="btn btn-blue" onClick={() => onSave(section, form)}>
            <SaveIcon width={13} height={13} /> Save Changes
          </button>
        </>
      }
    >
      <div className="form-grid" style={{ gap: 10 }}>
        <div className="form-group full">
          <label>{config.nameLabel}</label>
          <input className="form-input" placeholder={config.namePlaceholder} value={form.name} onChange={(e) => setField('name')(e.target.value)} />
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
          </div>
        )}
        <div className="form-group">
          <label>CONTACT NUMBER</label>
          <input className="form-input" placeholder="09XXXXXXXXX" value={form.phone} onChange={(e) => setField('phone')(e.target.value)} />
        </div>
        <div className="form-group full">
          <label>ADDRESS</label>
          <input className="form-input" placeholder="House No., Street, Barangay, City" value={form.address} onChange={(e) => setField('address')(e.target.value)} />
        </div>
      </div>
    </Modal>
  )
}
