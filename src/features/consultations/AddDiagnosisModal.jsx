import { useState } from 'react'
import Modal from '@components/ui/Modal'
import { PlusIcon } from '@components/ui/icons'

export default function AddDiagnosisModal({ isOpen, categories, onClose, onSubmit, onError }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState(Object.keys(categories)[0] || 'Other')

  function handleSubmit() {
    const trimmed = name.trim()
    if (!trimmed) return onError('Please enter a diagnosis name')
    onSubmit(trimmed, category)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add New Diagnosis"
      icon={<PlusIcon width={16} height={16} />}
      actions={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-blue" onClick={handleSubmit}>
            Add Diagnosis
          </button>
        </>
      }
    >
      <div className="form-group">
        <label>DIAGNOSIS NAME *</label>
        <input
          className="form-input"
          placeholder="e.g., Chronic Kidney Disease"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="form-group" style={{ marginTop: 10 }}>
        <label>CATEGORY</label>
        <select className="form-select" value={category} onChange={(e) => setCategory(e.target.value)}>
          {Object.keys(categories).map((c) => (
            <option key={c}>{c}</option>
          ))}
          <option>Other</option>
        </select>
      </div>
    </Modal>
  )
}
