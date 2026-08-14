import { useEffect, useState } from 'react'
import SearchableSelect from '@components/ui/SearchableSelect'
import { searchPatientsPublic } from '@services/usersService'
import { maskUserNumber } from '@lib/format'

/**
 * Same SearchableSelect component Consultation's "PATIENT *" field
 * already uses — matches its look/behavior exactly. Patients are loaded
 * once via the public RPC (works whether the caller is logged in or not,
 * unlike listUsers() which requires staff/admin RLS access), then
 * filtered/displayed entirely client-side, same as Consultation does
 * with its own pre-loaded patients array.
 */
export default function EmergencyPatientPicker({ selected, onSelect, onClear, placeholder, excludeUserId }) {
  const [allPatients, setAllPatients] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    searchPatientsPublic('')
      .then((list) => {
        if (!cancelled) setAllPatients(list)
      })
      .catch(() => {
        if (!cancelled) setAllPatients([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const options = allPatients
    .filter((p) => !excludeUserId || p.user_id !== excludeUserId)
    .map((p) => ({ value: String(p.user_id), label: p.name, sub: maskUserNumber(p.student_number) }))

  return (
    <SearchableSelect
      options={options}
      value={selected ? String(selected.user_id) : ''}
      displayValue={selected ? `${selected.name} — ${maskUserNumber(selected.student_number)}` : ''}
      onSelect={(val) => {
        const p = allPatients.find((x) => String(x.user_id) === val)
        if (p) onSelect({ user_id: p.user_id, name: p.name, student_number: p.student_number })
      }}
      onClear={onClear}
      placeholder={loading ? 'Loading patients…' : placeholder}
      emptyLabel="No patients found"
    />
  )
}