import { useState } from 'react'
import SearchableSelect from '@components/ui/SearchableSelect'
import { sanitizeVitals } from '@lib/vitals'
import { getInventoryStatus } from '@features/inventory/lib/inventoryHelpers'
import { getDiagnosisCategory } from '@services/diagnosesService'
import MedRow from './MedRow'
import { ConsultationIcon, PeopleIcon, BarChartIcon, TagIcon, PillIcon, CalendarIcon, SaveIcon, RefreshCwIcon, ClipboardIcon, PlusIcon } from '@components/ui/icons'

const EMPTY_MED_ROW = () => ({ id: crypto.randomUUID(), name: '', dosage: '', frequency: '', qty: '1' })

function emptyForm() {
  return {
    patientId: '',
    patientDisplay: '',
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
    if (!form.patientId) return onError('Please select a patient')
    if (!form.complaint.trim()) return onError('Please enter main complaint')
    if (!form.diagnosis) return onError('Please select a diagnosis')
    const diagnosis =
      form.diagnosis === 'Others' ? form.diagnosisOther.trim() || 'Others' : form.diagnosis
    if (!form.assessment.trim()) return onError('Please enter assessment/notes')
    if (!form.date) return onError('Please select a date')

    const patient = patients.find((p) => String(p.user_id) === form.patientId)
    const prescribedMeds = medRows
      .filter((r) => r.name)
      .map((r) => ({ name: r.name, dosage: r.dosage, frequency: r.frequency, qty: parseInt(r.qty, 10) || 1 }))

    onSubmit({
      patient,
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
          <div className="form-grid">
            <div className="form-group">
              <label>PATIENT *</label>
              <SearchableSelect
                options={patientOptions}
                value={form.patientId}
                displayValue={form.patientDisplay}
                placeholder="--Select patient by name or ID--"
                onSelect={(val) => {
                  const opt = patientOptions.find((o) => o.value === val)
                  setForm((f) => ({ ...f, patientId: val, patientDisplay: opt ? `${opt.label} — ${opt.sub}` : '' }))
                }}
                onClear={() => setForm((f) => ({ ...f, patientId: '', patientDisplay: '' }))}
                emptyLabel="No patients found"
              />
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
              <input className="form-input" type="date" value={form.date} onChange={(e) => setField('date')(e.target.value)} />
            </div>
            <div className="form-group">
              <label>ATTENDED BY</label>
              <select className="form-select" value={form.staffId} onChange={(e) => setField('staffId')(e.target.value)}>
                <option value="">-- Select Staff --</option>
                {staff.map((s) => (
                  <option key={s.user_id} value={s.user_id}>
                    {s.name}
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
                ['bp', 'Blood Pressure', '120/80'],
                ['temp', 'Temp (°C)', '36.5'],
                ['pulse', 'Pulse Rate', '72'],
                ['o2sat', 'O₂ Sat (%)', '98'],
              ].map(([field, label, ph]) => (
                <div className="vital-box" key={field}>
                  <input
                    className="form-input"
                    placeholder={ph}
                    inputMode="decimal"
                    style={{ textAlign: 'center' }}
                    value={form[field]}
                    onChange={(e) => setField(field)(sanitizeVitals(e.target.value))}
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

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-blue btn-lg" onClick={handleSubmit}>
              <SaveIcon width={13} height={13} /> Save to Health Records + Deduct Inventory
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
                <div className="inv-quick-row" key={i.inventory_id}>
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
          <div style={{ padding: '10px 14px', maxHeight: 260, overflowY: 'auto' }}>
            {Object.entries(diagCategories).map(([cat, diags]) => (
              <div key={cat} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
                  {cat}
                </div>
                {diags.map((d) => (
                  <div key={d} className="diag-code-item" onClick={() => handleSelectDiagnosis(d)}>
                    {d}
                  </div>
                ))}
              </div>
            ))}
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
