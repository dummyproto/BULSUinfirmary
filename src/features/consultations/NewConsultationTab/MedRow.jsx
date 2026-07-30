import SearchableSelect from '@components/ui/SearchableSelect'

export default function MedRow({ row, inventory, onChange, onRemove, canRemove }) {
  const medOptions = inventory.map((i) => ({
    value: i.name,
    label: i.name,
    sub: `${i.quantity} ${i.unit || 'unit'} available`,
  }))

  const setField = (field) => (val) => onChange({ ...row, [field]: val })

  return (
    <div className="med-row">
      <div className="med-row-grid">
        <SearchableSelect
          options={medOptions}
          value={row.name}
          displayValue={row.name}
          onSelect={setField('name')}
          onClear={() => setField('name')('')}
          placeholder="Search or select medicine"
          iconLabel="RX"
          iconClassName="medicine-item-icon"
          emptyLabel="No medicines found"
        />
        <input
          className="form-input med-dosage"
          placeholder="Dosage e.g. 500mg"
          style={{ fontSize: 12 }}
          value={row.dosage}
          onChange={(e) => setField('dosage')(e.target.value)}
        />
        <input
          className="form-input med-freq"
          placeholder="e.g. TID x 3 days"
          style={{ fontSize: 12 }}
          value={row.frequency}
          onChange={(e) => setField('frequency')(e.target.value)}
        />
        <input
          className="form-input med-qty"
          type="number"
          min="1"
          placeholder="Qty"
          style={{ fontSize: 13, width: 70, textAlign: 'center' }}
          value={row.qty}
          onChange={(e) => setField('qty')(e.target.value.replace(/[^0-9]/g, ''))}
/>
        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            style={{
              background: 'var(--danger-light)',
              color: 'var(--danger)',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              padding: '0 10px',
              fontSize: 16,
            }}
          >
            ×
          </button>
        ) : (
          <div style={{ width: 36 }} />
        )}
      </div>
    </div>
  )
}