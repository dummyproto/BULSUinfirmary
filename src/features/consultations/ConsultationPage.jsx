import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '@context/ToastContext'
import { useAuth } from '@context/AuthContext'
import Tabs from '@components/ui/Tabs'
import Spinner from '@components/ui/Spinner'
import NewConsultationTab from './NewConsultationTab'
import EHRRecordsTab from './EHRRecordsTab'
import CaseListingTab from './CaseListingTab'
import AnalyticsTab from './AnalyticsTab'
import MedDeductionModal from './MedDeductionModal'
import AddDiagnosisModal from './AddDiagnosisModal'
import HealthDetailModal from './HealthDetailModal'
import { listDiagnoses, createDiagnosis } from '@services/diagnosesService'
import { listConsultations, createConsultation } from '@services/consultationsService'
import { listInventory, deductForConsultation, listLogsForConsultation } from '@services/inventoryService'
import { listMedicinesAsInventoryItems, deductMedicinesForConsultation } from '@services/medicineService'
import { listUsers } from '@services/usersService'
import { notify } from '@services/notificationsService'

import { PlusIcon, FolderIcon, ClipboardIcon, BarChartIcon } from '@components/ui/icons'

const tabLabelStyle = { display: 'inline-flex', alignItems: 'center', gap: 6 }

// Derives both shapes every consumer of the diagnosis list actually
// needs (a flat name array for the "New Consultation" picker, and a
// {category: [names]} grouping for AddDiagnosisModal's category <select>
// and AnalyticsTab's breakdown) from one set of rows — used both on
// initial load and after createDiagnosis(), so there's exactly one place
// this grouping logic lives, not two slightly-different copies.
function groupDiagnoses(rows) {
  const list = rows.map((r) => r.name)
  const categories = {}
  for (const r of rows) {
    if (!categories[r.category]) categories[r.category] = []
    categories[r.category].push(r.name)
  }
  return { list, categories }
}

const TABS = [
  { key: 'new', label: <span style={tabLabelStyle}><PlusIcon width={14} height={14} /> New Consultation</span> },
  { key: 'records', label: <span style={tabLabelStyle}><FolderIcon width={14} height={14} /> Health Records</span> },
  { key: 'cases', label: <span style={tabLabelStyle}><ClipboardIcon width={14} height={14} /> Case Listing</span> },
  { key: 'analytics', label: <span style={tabLabelStyle}><BarChartIcon width={14} height={14} /> Analytics</span> },
]

export default function ConsultationPage() {
  const { show } = useToast()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [tab, setTab] = useState('new')
  const [loading, setLoading] = useState(true)
  const [consultations, setConsultations] = useState([])
  const [inventory, setInventory] = useState([])
  const [patients, setPatients] = useState([])
  const [staff, setStaff] = useState([])

  // Diagnosis reference list — was static client-side data with no
  // backing table at all (Phase 8 fixed this: see the new `diagnoses`
  // table, migration 020, and diagnosesService.js). Loaded from the
  // database in the effect below, alongside everything else this page
  // already fetches on mount.
  const [diagnosisList, setDiagnosisList] = useState([])
  const [diagCategories, setDiagCategories] = useState({})

  const [consSearch, setConsSearch] = useState('')
  const [caseFilters, setCaseFilters] = useState({ search: '', diagFilter: 'All', dateFrom: '', dateTo: '' })

  const [detailId, setDetailId] = useState(null)
  const [detailLogs, setDetailLogs] = useState([])
  const [deduction, setDeduction] = useState(null) // { result, consultationId }
  const [addDiagnosisOpen, setAddDiagnosisOpen] = useState(false)
  const [formKey, setFormKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([listConsultations(), listInventory(), listUsers(), listMedicinesAsInventoryItems(), listDiagnoses()])
      .then(([cons, inv, users, medicines, diagnoses]) => {
        if (cancelled) return
        setConsultations(cons)
        // Medicine now lives in the new normalized tables (see the
        // Inventory feature's Phase 2/3 work) — legacy `inventory` rows
        // with category='Medicine' still exist but are stale (nothing
        // new is ever written there anymore), so they're suppressed here
        // the same way InventoryPage.jsx does, and replaced with the
        // live medicines list.
        setInventory([...inv.filter((i) => i.category !== 'Medicine'), ...medicines])
        setPatients(users.filter((u) => u.role === 'patient'))
        setStaff(users.filter((u) => u.role === 'staff'))
        const { list, categories } = groupDiagnoses(diagnoses)
        setDiagnosisList(list)
        setDiagCategories(categories)
      })
      .catch((err) => show(`Failed to load consultation data: ${err.message}`, 'error'))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Rebuilds the tab's label with a live count. Previously did this via a
  // template literal (`${t.label} (${count})`), which silently calls
  // .toString() on the JSX element already in t.label — React elements
  // have no meaningful string form, so this produced the literal text
  // "[object Object] (N)" instead of the icon + "Health Records (N)" it
  // was supposed to show. Fixed by composing new JSX instead of
  // stringifying the old JSX.
  const tabItems = TABS.map((t) =>
    t.key === 'records'
      ? { ...t, label: <span style={tabLabelStyle}><FolderIcon width={14} height={14} /> Health Records ({consultations.length})</span> }
      : t
  )

  async function refreshInventory() {
    try {
      const [inv, medicines] = await Promise.all([listInventory(), listMedicinesAsInventoryItems()])
      setInventory([...inv.filter((i) => i.category !== 'Medicine'), ...medicines])
    } catch (err) {
      show(`Failed to refresh inventory: ${err.message}`, 'error')
    }
  }

  async function handleSaveConsultation(payload) {
    const { patient, visitType, date, staffId, complaint, bp, temp, pulse, o2sat, diagnosis, assessment, followUpDate, followUpNotes, prescribedMeds } = payload

    try {
      const created = await createConsultation({
        patientId: patient.user_id,
        visitType,
        date,
        staffId,
        complaint,
        bp,
        temp,
        pulse,
        o2sat,
        diagnosis,
        assessment,
        followUpDate,
        followUpNotes,
        prescribedMeds,
      })
      setConsultations((list) => [created, ...list])
      try {
        await notify({
          targetUserId: patient.user_id,
          message: `A consultation record was added for your visit on ${date} (${visitType}).`,
          type: 'info',
          module: '/dashboard',
        })
      } catch {
        // Non-critical — the consultation itself already saved successfully.
      }

      if (prescribedMeds.length > 0) {
        // New medicines table is authoritative (real FIFO batch
        // deduction) — the legacy inventory-table path only runs as a
        // fallback for any prescribed medicine it doesn't find, which
        // shouldn't normally happen post-Phase-2-backfill, but keeps
        // older/unmigrated data from silently failing to deduct.
        const primary = await deductMedicinesForConsultation(prescribedMeds, staffId ?? profile?.user_id, created.consultation_id)
        const notFound = primary.errors.filter((e) => e.notFound).map((e) => prescribedMeds.find((m) => m.name === e.medicine)).filter(Boolean)
        let result = primary
        if (notFound.length > 0) {
          const fallback = await deductForConsultation(notFound, staffId ?? profile?.user_id, created.consultation_id)
          result = {
            deductions: [...primary.deductions, ...fallback.deductions],
            errors: [...primary.errors.filter((e) => !e.notFound), ...fallback.errors],
          }
        }
        await refreshInventory()
        setDeduction({ result, consultationId: created.consultation_id })
      } else {
        show(`Consultation saved for ${patient.name}!`, 'success')
        setTab('records')
      }
      setFormKey((k) => k + 1)
    } catch (err) {
      show(`Failed to save consultation: ${err.message}`, 'error')
    }
  }

  function closeDeductionModal() {
    setDeduction(null)
    setTab('records')
  }

  async function handleAddDiagnosis(name, category) {
    if (diagnosisList.includes(name)) {
      setAddDiagnosisOpen(false)
      show(`"${name}" is already in the diagnosis list.`, 'info')
      return
    }
    try {
      await createDiagnosis(name, category)
      // Refresh from the database rather than locally splicing the new
      // row into existing state — the previous version of this handler
      // only ever did the latter (that was the whole bug this phase
      // fixes), so re-fetching here is deliberate, not incidental.
      const diagnoses = await listDiagnoses()
      const { list, categories } = groupDiagnoses(diagnoses)
      setDiagnosisList(list)
      setDiagCategories(categories)
      setAddDiagnosisOpen(false)
      show(`"${name}" added to the diagnosis list.`, 'success')
      setTab('new')
    } catch (err) {
      // 23505 = Postgres unique_violation — the `name` UNIQUE constraint
      // (migration 020) catching a race with another user/tab, not a
      // real failure; everything else is a genuine error.
      if (err.code === '23505') {
        show(`"${name}" was just added by someone else — refreshing the list.`, 'info')
        const diagnoses = await listDiagnoses().catch(() => [])
        if (diagnoses.length) {
          const { list, categories } = groupDiagnoses(diagnoses)
          setDiagnosisList(list)
          setDiagCategories(categories)
        }
        setAddDiagnosisOpen(false)
      } else {
        show(`Failed to add diagnosis: ${err.message}`, 'error')
      }
    }
  }

  const detailConsultation = consultations.find((c) => c.consultation_id === detailId) || null
  const detailAttendedBy = detailConsultation ? staff.find((s) => s.user_id === detailConsultation.attended_by)?.name : null

  useEffect(() => {
    if (detailId === null) return
    listLogsForConsultation(detailId)
      .then(setDetailLogs)
      .catch((err) => show(`Failed to load inventory logs: ${err.message}`, 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailId])

  function closeDetail() {
    setDetailId(null)
    setDetailLogs([])
  }

  if (loading) return <Spinner label="Loading consultations…" />

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Tabs tabs={tabItems} active={tab} onChange={setTab} />
      </div>

      {tab === 'new' && (
        <NewConsultationTab
          patients={patients}
          staff={staff}
          inventory={inventory}
          diagnosisList={diagnosisList}
          diagCategories={diagCategories}
          onSubmit={handleSaveConsultation}
          onError={(msg) => show(msg, 'error')}
          onOpenAddDiagnosis={() => setAddDiagnosisOpen(true)}
          formKey={formKey}
        />
      )}

      {tab === 'records' && (
        <EHRRecordsTab
          consultations={consultations}
          search={consSearch}
          onSearchChange={setConsSearch}
          onView={setDetailId}
          onPrint={() => show('Printing is migrated with the Reports feature.', 'info')}
        />
      )}

      {tab === 'cases' && (
        <CaseListingTab
          consultations={consultations}
          filters={caseFilters}
          onFiltersChange={setCaseFilters}
          onView={setDetailId}
        />
      )}

      {tab === 'analytics' && <AnalyticsTab consultations={consultations} categories={diagCategories} />}

      <HealthDetailModal
        isOpen={detailId !== null}
        onClose={closeDetail}
        consultation={detailConsultation}
        attendedByName={detailAttendedBy}
        deductionLogs={detailLogs}
        onPrint={() => show('Printing is migrated with the Reports feature.', 'info')}
      />

      <MedDeductionModal
        isOpen={deduction !== null}
        result={deduction?.result}
        consultationId={deduction?.consultationId}
        onClose={closeDeductionModal}
        onViewInventory={() => {
          setDeduction(null)
          navigate('/inventory')
        }}
      />

      <AddDiagnosisModal
        isOpen={addDiagnosisOpen}
        categories={diagCategories}
        onClose={() => setAddDiagnosisOpen(false)}
        onSubmit={handleAddDiagnosis}
        onError={(msg) => show(msg, 'error')}
      />
    </>
  )
}
