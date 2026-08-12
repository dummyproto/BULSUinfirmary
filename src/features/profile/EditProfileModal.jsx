import { useEffect, useState } from 'react'
import Modal from '@components/ui/Modal'
import { COURSES, YEAR_LEVELS, GENDERS, CIVIL_STATUSES, BLOOD_TYPES, EXTENSIONS, buildFullName } from './lib/profileHelpers'
import { normalizeSchoolIdCode } from '@lib/schoolId'
import { getRegions, getProvinces, getCities, getBarangays } from '@lib/phAddress'
import SchoolIdScanModal from './SchoolIdScanModal'
import { EditIcon, SaveIcon, UserIcon, CreditCardIcon, PhoneIcon, MapPinIcon, GraduationCapIcon, BriefcaseIcon, QrCodeIcon } from '@components/ui/icons'

export default function EditProfileModal({ isOpen, role, profile, onClose, onSave, onError }) {
  const [scanOpen, setScanOpen] = useState(false)
  const [form, setForm] = useState(() => ({ ...profile }))
  const [regionOptions, setRegionOptions] = useState([])
  const [provinceOptions, setProvinceOptions] = useState([])
  const [cityOptions, setCityOptions] = useState([])
  const [barangayOptions, setBarangayOptions] = useState([])

  // Loads the full region list once, the moment this modal is actually
  // open — the ~1.8MB PSGC dataset (see phAddress.js) is dynamically
  // imported on first call, so nothing here downloads it until a
  // patient actually opens their profile editor.
  useEffect(() => {
    if (!isOpen) return
    getRegions().then(setRegionOptions)
  }, [isOpen])

  // Each level re-loads its options whenever its PARENT selection
  // changes — including on the very first open, so an already-saved
  // address (e.g. addrRegion: "CALABARZON" from before this was a
  // dropdown) correctly populates Province/City/Barangay with the
  // right options instead of starting empty.
  useEffect(() => {
    if (!isOpen) return
    getProvinces(form.addrRegion).then(setProvinceOptions)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, form.addrRegion])

  useEffect(() => {
    if (!isOpen) return
    getCities(form.addrProvince, form.addrRegion).then(setCityOptions)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, form.addrProvince, form.addrRegion])

  useEffect(() => {
    if (!isOpen) return
    getBarangays(form.addrCity, form.addrProvince).then(setBarangayOptions)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, form.addrCity, form.addrProvince])

  if (!isOpen) return null
  const setField = (field) => (val) => setForm((f) => ({ ...f, [field]: val }))
  // Picking a new value at any address level invalidates whatever was
  // selected below it (a different region has entirely different
  // provinces) — clearing them here, rather than leaving a now-stale
  // value in form state that no longer matches any option in the
  // freshly-loaded list below it.
  function setRegion(val) {
    setForm((f) => ({ ...f, addrRegion: val, addrProvince: '', addrCity: '', addrBarangay: '' }))
  }
  function setProvince(val) {
    setForm((f) => ({ ...f, addrProvince: val, addrCity: '', addrBarangay: '' }))
  }
  function setCity(val) {
    setForm((f) => ({ ...f, addrCity: val, addrBarangay: '' }))
  }

  function handleSave() {
    const email = (form.email || '').trim().toLowerCase()
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return onError('Invalid email format')

    if (role === 'patient') {
      const username = (form.username || '').replace(/\s/g, '').toLowerCase()
      if (!username) return onError('Username cannot be empty')
      const name = buildFullName(form, profile.name)
      // Phase Q — normalized the same way a scanned code is (same helper
      // `RegisterQrScan`/`QrLoginScan` use), so a manually-typed code
      // matches on lookup regardless of case/whitespace differences.
      const schoolIdBarcode = form.schoolIdBarcode ? normalizeSchoolIdCode(form.schoolIdBarcode) : ''
      onSave({ ...form, email, username, name, schoolIdBarcode })
    } else {
      const name = (form.name || '').trim() || profile.name
      onSave({ ...form, email, name })
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Personal Information"
      icon={<EditIcon width={16} height={16} />}
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
      {role === 'patient' ? (
        <>
          <FormSection Icon={UserIcon} title="Name">
            <div className="form-grid" style={{ gap: 10 }}>
              <div className="form-group">
                <label>SURNAME</label>
                <input className="form-input" placeholder="Last name" value={form.surname || ''} onChange={(e) => setField('surname')(e.target.value)} />
              </div>
              <div className="form-group">
                <label>FIRST NAME</label>
                <input className="form-input" placeholder="First name" value={form.givenName || ''} onChange={(e) => setField('givenName')(e.target.value)} />
              </div>
              <div className="form-group">
                <label>M.I.</label>
                <input
                  className="form-input"
                  placeholder="e.g. B"
                  maxLength={1}
                  value={form.mi || ''}
                  onChange={(e) => setField('mi')(e.target.value.replace(/[^a-zA-Z]/g, ''))}
                />
              </div>
              <SelectField label="EXT. (Jr. / Sr.)" value={form.ext} options={EXTENSIONS} onChange={setField('ext')} />
              <div className="form-group full">
                <label>USERNAME</label>
                <input
                  className="form-input"
                  placeholder="e.g. jdelacruz"
                  autoComplete="off"
                  value={form.username || ''}
                  onChange={(e) => setField('username')(e.target.value.replace(/\s/g, ''))}
                />
                <small style={{ color: 'var(--text-3)', fontSize: 11, marginTop: 3, display: 'block' }}>No spaces allowed. Must be unique.</small>
              </div>
            </div>
          </FormSection>

          <FormSection Icon={CreditCardIcon} title="Personal Details">
            <div className="form-grid" style={{ gap: 10 }}>
              <div className="form-group">
                <label>DATE OF BIRTH</label>
                <input className="form-input" type="date" value={form.dateOfBirth || ''} onChange={(e) => setField('dateOfBirth')(e.target.value)} />
              </div>
              <div className="form-group">
                <label>PLACE OF BIRTH</label>
                <input className="form-input" placeholder="City/Municipality" value={form.birthPlace || ''} onChange={(e) => setField('birthPlace')(e.target.value)} />
              </div>
              <SelectField label="GENDER" value={form.gender} options={GENDERS} onChange={setField('gender')} />
              <SelectField label="CIVIL STATUS" value={form.civilStatus} options={CIVIL_STATUSES} onChange={setField('civilStatus')} />
              <div className="form-group">
                <label>RELIGION</label>
                <input className="form-input" placeholder="e.g. Roman Catholic" value={form.religion || ''} onChange={(e) => setField('religion')(e.target.value)} />
              </div>
              <div className="form-group">
                <label>NATIONALITY</label>
                <input className="form-input" placeholder="e.g. Filipino" value={form.nationality || 'Filipino'} onChange={(e) => setField('nationality')(e.target.value)} />
              </div>
              <SelectField label="BLOOD TYPE" value={form.bloodType} options={BLOOD_TYPES} onChange={setField('bloodType')} />
            </div>
          </FormSection>

          <FormSection Icon={PhoneIcon} title="Contact">
            <div className="form-grid" style={{ gap: 10 }}>
              <div className="form-group">
                <label>EMAIL</label>
                <input className="form-input" type="email" value={form.email || ''} onChange={(e) => setField('email')(e.target.value)} />
              </div>
              <div className="form-group">
                <label>CONTACT NUMBER</label>
                <input
  className="form-input"
  placeholder="09XXXXXXXXX"
  inputMode="numeric"
  maxLength={11}
  value={form.phone || ''}
  onChange={(e) => setField('phone')(e.target.value.replace(/\D/g, '').slice(0, 11))}
/>
              </div>
            </div>
          </FormSection>

          <FormSection Icon={MapPinIcon} title="Address">
            <div className="form-grid" style={{ gap: 10 }}>
              <SelectField label="REGION" value={form.addrRegion} options={regionOptions} onChange={setRegion} />
              <SelectField label="PROVINCE" value={form.addrProvince} options={provinceOptions} onChange={setProvince} />
              <SelectField label="CITY / MUNICIPALITY" value={form.addrCity} options={cityOptions} onChange={setCity} />
              <SelectField label="BARANGAY" value={form.addrBarangay} options={barangayOptions} onChange={setField('addrBarangay')} />
              <div className="form-group">
                <label>ZIP CODE</label>
                <input
                  className="form-input"
                  placeholder="e.g. 1101"
                  maxLength={4}
                  inputMode="numeric"
                  value={form.addrZip || ''}
                  onChange={(e) => setField('addrZip')(e.target.value.replace(/\D/g, '').slice(0, 4))}
                />
              </div>
            </div>
          </FormSection>

          <FormSection Icon={GraduationCapIcon} title="Academic">
            <div className="form-grid" style={{ gap: 10 }}>
              <SelectField label="COURSE" value={form.course} options={COURSES} onChange={setField('course')} />
              <SelectField label="YEAR LEVEL" value={form.yearLevel} options={YEAR_LEVELS} onChange={setField('yearLevel')} />
            </div>
          </FormSection>

          <FormSection Icon={CreditCardIcon} title="School ID">
            <div className="form-grid" style={{ gap: 10 }}>
              <div className="form-group full">
                <label>SCHOOL ID / BARCODE CODE</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="form-input"
                    placeholder="e.g. 2021-00123"
                    autoComplete="off"
                    style={{ flex: 1 }}
                    value={form.schoolIdBarcode || ''}
                    onChange={(e) => setField('schoolIdBarcode')(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ flexShrink: 0 }}
                    onClick={() => setScanOpen(true)}
                  >
                    <QrCodeIcon width={14} height={14} /> Scan
                  </button>
                </div>
                <small style={{ color: 'var(--text-3)', fontSize: 11, marginTop: 3, display: 'block' }}>
                  {form.schoolIdBarcode
                    ? 'Linked — scanning your ID at login will identify this account (you still need your password).'
                    : "Not linked yet. Scan your school ID's QR code or type the code here to enable Scan ID at login, or leave blank."}
                </small>
              </div>
            </div>
          </FormSection>
        </>
      ) : (
        <>
          <FormSection Icon={UserIcon} title="Basic Information">
            <div className="form-grid" style={{ gap: 10 }}>
              <div className="form-group full">
                <label>FULL NAME</label>
                <input className="form-input" value={form.name || ''} onChange={(e) => setField('name')(e.target.value)} />
              </div>
              <div className="form-group">
                <label>EMAIL</label>
                <input className="form-input" type="email" value={form.email || ''} onChange={(e) => setField('email')(e.target.value)} />
              </div>
              <div className="form-group">
                <label>CONTACT NUMBER</label>
                <input
  className="form-input"
  placeholder="09XXXXXXXXX"
  inputMode="numeric"
  maxLength={11}
  value={form.phone || ''}
  onChange={(e) => setField('phone')(e.target.value.replace(/\D/g, '').slice(0, 11))}
/>
              </div>
            </div>
          </FormSection>
          <FormSection Icon={BriefcaseIcon} title="Work Information">
            <div className="form-grid" style={{ gap: 10 }}>
              <div className="form-group">
                <label>DEPARTMENT</label>
                <input className="form-input" value={form.department || ''} onChange={(e) => setField('department')(e.target.value)} />
              </div>
              <div className="form-group">
                <label>POSITION</label>
                <input className="form-input" value={form.position || ''} onChange={(e) => setField('position')(e.target.value)} />
              </div>
            </div>
          </FormSection>
        </>
      )}

      <SchoolIdScanModal
        isOpen={scanOpen}
        currentEmail={profile.email}
        onClose={() => setScanOpen(false)}
        onScanned={(code) => {
          setField('schoolIdBarcode')(code)
          setScanOpen(false)
          onError('')
        }}
        onError={onError}
      />
    </Modal>
  )
}

function FormSection({ Icon, title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: '2px solid var(--primary)' }}>
        <Icon width={16} height={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

function SelectField({ label, value, options, onChange }) {
  return (
    <div className="form-group">
      <label>{label}</label>
      <select className="form-select" value={value || ''} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>
          -- Select --
        </option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  )
}