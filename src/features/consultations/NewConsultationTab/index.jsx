import { useState } from 'react'
import SearchableSelect from '@components/ui/SearchableSelect'
import { maskBloodPressure, maskTemperature, capPulse, capO2Sat } from '@lib/vitals'
import { getInventoryStatus } from '@features/inventory/lib/inventoryHelpers'
import { getDiagnosisCategory } from '@services/diagnosesService'
import MedRow from './MedRow'
import { ConsultationIcon, PeopleIcon, BarChartIcon, TagIcon, PillIcon, CalendarIcon, SaveIcon, RefreshCwIcon, ClipboardIcon, PlusIcon } from '@components/ui/icons'

const EMPTY_MED_ROW = () => ({ id: crypto.randomUUID(), name: '', dosage: '', frequency: '', qty: '' })

// Diagnosis categories come from the diagnoses table (see
// ConsultationPage's setDiagCategories), so the actual set of category
// names isn't fixed/known ahead of time — a hardcoded name->color map
// would silently leave any new category uncolored. Hashing the name into
// one of the app's existing 7 badge colors instead means every category
// always gets a color, and the SAME category always gets the SAME color
// on every render/reload (a stable hash, not Math.random()), which is
// what actually makes color useful for quick recognition here.
const DIAG_CATEGORY_COLORS = ['blue', 'green', 'orange', 'purple', 'red', 'teal', 'gray']
function diagCategoryColor(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return DIAG_CATEGORY_COLORS[Math.abs(hash) % DIAG_CATEGORY_COLORS.length]
}
// Matches each badge-X class's own actual color (see .badge-blue etc. in
// legacy.css) — several of them are plain hex, not same-named CSS
// variables (e.g. badge-blue is #1D4ED8, there's no `--blue` variable),
// so this maps to the real value directly rather than guessing a
// var(--color) name that wouldn't resolve.
const DIAG_CATEGORY_COLOR_VALUES = {
  blue: '#1D4ED8',
  green: 'var(--success)',
  orange: 'var(--warning)',
  purple: 'var(--purple)',
  red: 'var(--danger)',
  teal: 'var(--teal)',
  gray: 'var(--text-2)',
}


function emptyForm() {
  return {
    patientId: '',
    patientDisplay: '',
    isUnregistered: false,
    unregisteredName: '',
    visitType: 'Walk-in',
    date: new Date().toISOString().slice(0, 10),
    staffId: '',
    complaint: '',
    bp: '',
    temp: '',
    pulse: '',
    o2sat: '',
    diagnosis: '',
    diagnosisOther: '',
    assessment: '',
    followUpDate: '',
    followUpNotes: '',
  }
}

export default function NewConsultationTab({
  patients,
  staff,
  inventory,
  diagnosisList,
  diagCategories,
  onSubmit,
  onError,
  onOpenAddDiagnosis,
  formKey, // bumped by parent to force-reset the form after a successful save
}) {
  const [form, setForm] = useState(emptyForm)
  const [medRows, setMedRows] = useState([EMPTY_MED_ROW()])

  const setField = (field) => (val) => setForm((f) => ({ ...f, [field]: val }))

  const patientOptions = patients.map((p) => ({
    value: String(p.user_id),
    label: p.name,
    sub: p.student_number,
  }))
  const diagnosisOptions = diagnosisList.map((d) => ({
    value: d,
    label: d,
    sub: getDiagnosisCategory(d, diagCategories),
  }))
  // Colors the Primary Diagnosis dropdown's "DX" badge to match the same
  // per-category color used for the divider/badge treatment in the
  // Diagnosis Codes list — `opt.sub` is already the category name (see
  // diagnosisOptions above), so this is just the same hash-based color
  // lookup applied here too, not a second/different scheme. Returns a
  // class name (diag-icon-<color>, defined in legacy.css) rather than an
  // inline style — these badges needed to stay readable in dark mode too
  // (see the [data-theme="dark"] .diag-icon-X rules), and an inline
  // style always wins over a CSS class regardless of theme, which is
  // exactly what made the badges unreadable when this used getIconStyle
  // instead.
  function getDiagnosisIconClassName(opt) {
    return `diag-icon-${diagCategoryColor(opt.sub || '')}`
  }
  const medicineInventory = inventory.filter((i) => i.category === 'Medicine')

  function updateMedRow(idx, next) {
    setMedRows((rows) => rows.map((r, i) => (i === idx ? next : r)))
  }
  function removeMedRow(idx) {
    setMedRows((rows) => rows.filter((_, i) => i !== idx))
  }
  function addMedRow() {
    setMedRows((rows) => [...rows, EMPTY_MED_ROW()])
  }

  function reset() {
    setForm(emptyForm())
    setMedRows([EMPTY_MED_ROW()])
  }

  function handleSelectDiagnosis(value) {
    setForm((f) => ({ ...f, diagnosis: value }))
  }

  function handleSubmit() {
  if (form.isUnregistered) {
    if (!form.unregisteredName.trim()) return onError('Please enter the unregistered patient\u2019s name')
  } else if (!form.patientId) {
    return onError('Please select a patient')
  }
  if (!form.complaint.trim()) return onError('Please enter main complaint')
    if (!form.diagnosis) return onError('Please select a diagnosis')
    const diagnosis =
      form.diagnosis === 'Others' ? form.diagnosisOther.trim() || 'Others' : form.diagnosis
    if (!form.assessment.trim()) return onError('Please enter assessment/notes')
    if (!form.date) return onError('Please select a date')
    if (form.date < new Date().toISOString().slice(0, 10)) return onError('Date cannot be in the past.')
    if (!form.staffId) return onError('Please select who attended this consultation')

    const patient = patients.find((p) => String(p.user_id) === form.patientId)
    const prescribedMeds = medRows
      .filter((r) => r.name)
      .map((r) => ({ name: r.name, dosage: r.dosage, frequency: r.frequency, qty: parseInt(r.qty, 10) || 1 }))

    onSubmit({
  patient,
  unregisteredPatientName: form.isUnregistered ? form.unregisteredName.trim() : null,
  visitType: form.visitType,
      date: form.date,
      staffId: form.staffId ? Number(form.staffId) : null,
      complaint: form.complaint.trim(),
      bp: form.bp.trim(),
      temp: form.temp.trim(),
      pulse: form.pulse.trim(),
      o2sat: form.o2sat.trim(),
      diagnosis,
      assessment: form.assessment.trim(),
      followUpDate: form.followUpDate || null,
      followUpNotes: form.followUpNotes || null,
      prescribedMeds,
    })
    reset()
  }

  return (
    <div className="cons-layout" key={formKey}>
      <div className="card cons-form-card">
        <div className="card-header">
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><ConsultationIcon width={15} height={15} /> New Consultation Entry</h3>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
              Medicines will be auto-deducted from inventory on save
            </div>
          </div>
        </div>
        <div style={{ padding: 18 }}>
          <div className="cons-section-label" style={{ display: 'flex', alignItems: 'center', gap: 7 }}><PeopleIcon width={13} height={13} /> Patient &amp; Visit Information</div>
<div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
  <button
    type="button"
    className={`btn btn-sm ${!form.isUnregistered ? 'btn-blue' : 'btn-outline'}`}
    onClick={() => setForm((f) => ({ ...f, isUnregistered: false, unregisteredName: '' }))}
  >
    Registered Patient
  </button>
  <button
    type="button"
    className={`btn btn-sm ${form.isUnregistered ? 'btn-blue' : 'btn-outline'}`}
    onClick={() => setForm((f) => ({ ...f, isUnregistered: true, patientId: '', patientDisplay: '' }))}
  >
    Unregistered Patient
  </button>
</div>
<div className="form-grid">
  <div className="form-group">
    <label>PATIENT *</label>
    {form.isUnregistered ? (
      <input
        className="form-input"
        placeholder="Full Name of Unregistered Patient"
        value={form.unregisteredName}
        onChange={(e) => setField('unregisteredName')(e.target.value)}
      />
    ) : (
      <SearchableSelect
        options={patientOptions}
        value={form.patientId}
        displayValue={form.patientDisplay}
        placeholder="Search patient by name or ID"
        onSelect={(val) => {
          const opt = patientOptions.find((o) => o.value === val)
          setForm((f) => ({ ...f, patientId: val, patientDisplay: opt ? `${opt.label} — ${opt.sub}` : '' }))
        }}
        onClear={() => setForm((f) => ({ ...f, patientId: '', patientDisplay: '' }))}
        emptyLabel="No patients found"
      />
    )}
  </div>
            <div className="form-group">
              <label>VISIT TYPE *</label>
              <select className="form-select" value={form.visitType} onChange={(e) => setField('visitType')(e.target.value)}>
                <option value="Walk-in">Walk-in</option>
                <option value="Emergency">Emergency</option>
              </select>
            </div>
            <div className="form-group">
              <label>DATE *</label>
            <input className="form-input" type="date" min={new Date().toISOString().slice(0, 10)} value={form.date} onChange={(e) => setField('date')(e.target.value)} />
            </div>
            <div className="form-group">
            <label>ATTENDED BY *</label>
              <select className="form-select" value={form.staffId} onChange={(e) => setField('staffId')(e.target.value)}>
              <option value="" disabled>-- Select Staff --</option>
              {staff.map((s) => (
              <option key={s.user_id} value={s.user_id}>
              {s.name}{s.position ? ` — ${s.position}` : ''} ({s.role === 'admin' ? 'Admin' : 'Staff'})
            </option>
            ))}
            </select>
            </div>
            <div className="form-group full">
              <label>MAIN COMPLAINT *</label>
              <textarea
                className="form-textarea"
                placeholder="Describe main complaint…"
                style={{ minHeight: 60 }}
                value={form.complaint}
                onChange={(e) => setField('complaint')(e.target.value)}
              />
            </div>
          </div>

          <div className="cons-section-label" style={{ marginTop: 16 }}>
            <BarChartIcon width={13} height={13} style={{ verticalAlign: -2, marginRight: 5 }} />Vital Signs
          </div>
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
            <div className="vitals-grid">
              {[
              ['bp', 'Blood Pressure', '120/10', maskBloodPressure],
              ['temp', 'Temp (°C)', '36.5', maskTemperature],
              ['pulse', 'Pulse Rate', '72', capPulse],
              ['o2sat', 'O₂ Sat (%)', '98', capO2Sat],
            ].map(([field, label, ph, maskFn]) => (
              <div className="vital-box" key={field}>
                <input
                  className="form-input"
                  placeholder={ph}
                  inputMode="decimal"
                  style={{ textAlign: 'center' }}
                  value={form[field]}
                  onChange={(e) => setField(field)(maskFn(e.target.value))}
                />
                <div className="vlbl">{label}</div>
              </div>
            ))}
            </div>
          </div>

          <div className="cons-section-label" style={{ display: 'flex', alignItems: 'center', gap: 7 }}><TagIcon width={13} height={13} /> Diagnosis</div>
          <div className="form-grid" style={{ marginBottom: 16 }}>
            <div className="form-group">
              <label>PRIMARY DIAGNOSIS *</label>
              <SearchableSelect
                options={diagnosisOptions}
                value={form.diagnosis}
                displayValue={form.diagnosis}
                placeholder="--Search or select diagnosis--"
                onSelect={handleSelectDiagnosis}
                onClear={() => handleSelectDiagnosis('')}
                iconLabel="DX"
                getIconClassName={getDiagnosisIconClassName}
                emptyLabel="No diagnosis found"
              />
            </div>
            {form.diagnosis === 'Others' && (
              <div className="form-group">
                <label>SPECIFY DIAGNOSIS *</label>
                <input
                  className="form-input"
                  placeholder="Enter custom diagnosis…"
                  value={form.diagnosisOther}
                  onChange={(e) => setField('diagnosisOther')(e.target.value)}
                />
              </div>
            )}
            <div className="form-group full">
              <label>ASSESSMENT / CLINICAL NOTES *</label>
              <textarea
                className="form-textarea"
                placeholder="Clinical findings, notes, and assessment…"
                value={form.assessment}
                onChange={(e) => setField('assessment')(e.target.value)}
              />
            </div>
          </div>

          <div className="cons-section-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>
              <PillIcon width={13} height={13} style={{ verticalAlign: -2, marginRight: 5 }} />Medicines Prescribed{' '}
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)' }}>
                (auto-deducted from inventory on save)
              </span>
            </span>
            <button type="button" className="btn btn-sm btn-outline" onClick={addMedRow}>
              + Add Medicine
            </button>
          </div>
          <div style={{ marginBottom: 16 }}>
            {medRows.map((row, idx) => (
              <MedRow
                key={row.id}
                row={row}
                inventory={medicineInventory}
                onChange={(next) => updateMedRow(idx, next)}
                onRemove={() => removeMedRow(idx)}
                canRemove={idx > 0}
              />
            ))}
          </div>

          <div className="cons-section-label" style={{ display: 'flex', alignItems: 'center', gap: 7 }}><CalendarIcon width={13} height={13} /> Follow-Up</div>
          <div className="form-grid" style={{ marginBottom: 20 }}>
            <div className="form-group">
              <label>FOLLOW-UP DATE</label>
              <input className="form-input" type="date" value={form.followUpDate} onChange={(e) => setField('followUpDate')(e.target.value)} />
            </div>
            <div className="form-group">
              <label>FOLLOW-UP NOTES</label>
              <input
                className="form-input"
                placeholder="Instructions for follow-up…"
                value={form.followUpNotes}
                onChange={(e) => setField('followUpNotes')(e.target.value)}
              />
            </div>
          </div>

          <div className="cons-submit-row" style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-blue btn-lg" onClick={handleSubmit}>
              <SaveIcon width={13} height={13} /> Save to Health Records{medRows.some((r) => r.name.trim()) ? ' + Deduct Inventory' : ''}
            </button>
            <button type="button" className="btn btn-outline btn-lg" onClick={reset}>
              <RefreshCwIcon width={13} height={13} /> Clear Form
            </button>
          </div>
        </div>
      </div>

      <div className="cons-side-panel">
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><PillIcon width={15} height={15} /> Available Medicines</h3>
          </div>
          <div style={{ padding: '10px 14px', maxHeight: 280, overflowY: 'auto' }}>
            {medicineInventory.length === 0 && (
              <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
                No medicines in inventory
              </div>
            )}
            {medicineInventory.map((i) => {
              const st = getInventoryStatus(i)
              return (
                <div className="inv-quick-row" key={i.inventory_id ?? i._id ?? i.name}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{i.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{i.unit}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 14,
                        color: st === 'Expired' ? 'var(--danger)' : st === 'Low Stock' ? 'var(--warning)' : 'var(--success)',
                      }}
                    >
                      {i.quantity}
                    </div>
                    <div style={{ fontSize: 10, color: st === 'Available' ? 'var(--success)' : 'var(--danger)' }}>{st}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><ClipboardIcon width={15} height={15} /> Diagnosis Codes</h3>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{diagnosisList.length} codes</span>
          </div>
          <div style={{ padding: '10px 14px', maxHeight: 520, overflowY: 'auto' }}>
            {Object.entries(diagCategories).map(([cat, diags], catIdx) => {
              const color = diagCategoryColor(cat)
              return (
                <div key={cat} style={catIdx > 0 ? { marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' } : undefined}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span className={`badge badge-no-dot badge-${color}`} style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                      {cat}
                    </span>
                  </div>
                  {diags.map((d) => (
                    <div key={d} className="diag-code-item" style={{ borderLeft: `2px solid ${DIAG_CATEGORY_COLOR_VALUES[color]}` }} onClick={() => handleSelectDiagnosis(d)}>
                      {d}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
          <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
            <button type="button" className="btn btn-sm btn-outline" style={{ width: '100%' }} onClick={onOpenAddDiagnosis}>
              <PlusIcon width={13} height={13} /> Add New Diagnosis
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}