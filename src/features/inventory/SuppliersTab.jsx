import { useState } from 'react'
import SearchInput from '@components/ui/SearchInput'
import { TruckIcon, PlusIcon, EditIcon, TrashIcon, PhoneIcon, MailIcon, ChevronDownIcon, ChevronUpIcon } from '@components/ui/icons'
import { defaultShowMore } from '@lib/viewport'

export default function SuppliersTab({ suppliers, batches, search, onSearchChange, onAdd, onEdit, onDelete }) {
  const [showMore, setShowMore] = useState(defaultShowMore)
  const q = search.toLowerCase()
  const filtered = search
    ? suppliers.filter(
        (s) =>
          s.supplier_name.toLowerCase().includes(q) ||
          (s.contact_person || '').toLowerCase().includes(q) ||
          (s.email || '').toLowerCase().includes(q)
      )
    : suppliers

  const usageCount = (supplierId) => batches.filter((b) => b._source === 'medicine' && b.supplier_id === supplierId).length

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <TruckIcon width={15} height={15} /> Suppliers
        </h3>
        <div style={{ display: 'flex', gap: 10, marginLeft: 'auto', alignItems: 'center', flexWrap: 'wrap' }}>
          <SearchInput value={search} onChange={onSearchChange} placeholder="Search suppliers…" width={220} />
          <button type="button" className="btn btn-xs btn-teal" onClick={onAdd} title="Add Supplier" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <PlusIcon width={13} height={13} /> Add Supplier
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline inv-view-more-btn"
            onClick={() => setShowMore((v) => !v)}
            title="Show or hide Contact Person, Phone, Email, Address, Remarks, and Batches columns"
            aria-label={showMore ? 'View Less — hide Contact Person, Phone, Email, Address, Remarks, and Batches columns' : 'View More — show Contact Person, Phone, Email, Address, Remarks, and Batches columns'}
          >
            {showMore ? <ChevronUpIcon width={13} height={13} /> : <ChevronDownIcon width={13} height={13} />}
            <span>{showMore ? 'View Less' : 'View More'}</span>
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state" style={{ padding: 40 }}>
          <p>{search ? 'No suppliers match your search' : 'No suppliers yet — add one to start assigning it to batches'}</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className={showMore ? undefined : 'compact-table'}>
            <thead>
              <tr>
                <th>Supplier</th>
                {showMore && (
                  <>
                    <th>Contact Person</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>Address</th>
                    <th>Remarks</th>
                    <th>Batches</th>
                  </>
                )}
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const count = usageCount(s.supplier_id)
                return (
                  <tr key={s.supplier_id}>
                    <td>
                      <strong>{s.supplier_name}</strong>
                    </td>
                    {showMore && (
                      <>
                        <td style={{ fontSize: 12 }}>{s.contact_person || '—'}</td>
                        <td style={{ fontSize: 12 }}>
                          {s.phone ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <PhoneIcon width={11} height={11} /> {s.phone}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td style={{ fontSize: 12 }}>
                          {s.email ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <MailIcon width={11} height={11} /> {s.email}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{s.address || '—'}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{s.remarks || '—'}</td>
                        <td>
                          <span className={`badge ${count > 0 ? 'badge-blue' : 'badge-gray'} badge-no-dot`} style={{ fontSize: 11 }}>
                            {count} batch{count === 1 ? '' : 'es'}
                          </span>
                        </td>
                      </>
                    )}
                    <td>
                      <div className="inv-action-group-icons">
                        <div className="inv-action-primary">
                          <button type="button" className="btn btn-sm btn-blue inv-action-btn" onClick={() => onEdit(s)} title="Edit supplier" aria-label="Edit supplier">
                            <EditIcon width={14} height={14} />
                            <span>Edit</span>
                          </button>
                        </div>
                        <div className="inv-action-destructive">
                          <button
                            type="button"
                            className="btn btn-sm btn-red inv-action-btn"
                            onClick={() => onDelete(s)}
                            disabled={count > 0}
                            title={count > 0 ? `Can't delete — used by ${count} batch${count === 1 ? '' : 'es'}` : 'Delete supplier'}
                            aria-label={count > 0 ? `Can't delete — used by ${count} batch${count === 1 ? '' : 'es'}` : 'Delete supplier'}
                            style={{ opacity: count > 0 ? 0.5 : 1 }}
                          >
                            <TrashIcon width={14} height={14} />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ padding: '12px 18px', fontSize: 12, color: 'var(--text-3)' }}>
        Suppliers linked to one or more batches can't be deleted — reassign or archive those batches first.
      </div>
    </div>
  )
}