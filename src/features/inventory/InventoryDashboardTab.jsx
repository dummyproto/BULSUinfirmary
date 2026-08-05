import { useEffect, useMemo, useRef, useState } from 'react'
import Chart from 'chart.js/auto'
import { formatDate, formatDateTime } from '@lib/format'
import { getInventoryStatus } from './lib/inventoryHelpers'
import { getMonthlyMovement, getTopUsedMedicines, getDamagedBatchCount, getExpiringBatchCount, getRecentlyReceived, getRecentlyReleased } from '@services/medicineService'
import { themedOptions, CHART_GRID_X, CHART_GRID_Y } from '@lib/chartTheme'
import {
  InventoryIcon,
  AlertTriangleIcon,
  AlertOctagonIcon,
  BellIcon,
  TrashIcon,
  DownloadIcon,
  MinusIcon,
  BarChartIcon,
  PillIcon,
  PackageXIcon,
} from '@components/ui/icons'

function useChart(canvasRef, config) {
  useEffect(() => {
    if (!canvasRef.current || !config) return undefined
    const chart = new Chart(canvasRef.current, config)
    return () => chart.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config])
}

function StatCard({ label, value, sub, Icon, color, onClick }) {
  return (
    <div className="stat-card" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <div className={`stat-icon ${color}`}>
        <Icon width={18} height={18} />
      </div>
      <div className="stat-num">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// Every number on this tab either comes straight from `inventory`
// (already loaded by InventoryPage for every other tab — reused here,
// not re-fetched) or from a dedicated Supabase query/RPC call fired on
// mount (Recently Received/Released, Damaged count, Monthly Movement,
// Top Used Medicines) — nothing here is a hardcoded number.
export default function InventoryDashboardTab({ inventory, onNavigateToStatus, onNavigateToBatches }) {
  const [damagedCount, setDamagedCount] = useState(null)
  const [expiring90, setExpiring90] = useState(null)
  const [expiring30, setExpiring30] = useState(null)
  const [expiring7, setExpiring7] = useState(null)
  const [recentlyReceived, setRecentlyReceived] = useState([])
  const [recentlyReleased, setRecentlyReleased] = useState([])
  const [monthlyMovement, setMonthlyMovement] = useState([])
  const [topUsed, setTopUsed] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getDamagedBatchCount(),
      getExpiringBatchCount(90),
      getExpiringBatchCount(30),
      getExpiringBatchCount(7),
      getRecentlyReceived(6),
      getRecentlyReleased(6),
      getMonthlyMovement(6),
      getTopUsedMedicines(30, 5),
    ])
      .then(([damaged, d90, d30, d7, received, released, movement, used]) => {
        if (cancelled) return
        setDamagedCount(damaged)
        setExpiring90(d90)
        setExpiring30(d30)
        setExpiring7(d7)
        setRecentlyReceived(received)
        setRecentlyReleased(released)
        setMonthlyMovement(movement)
        setTopUsed(used)
      })
      .catch((err) => setError(err.message))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const medicineItems = useMemo(() => inventory.filter((i) => i._source === 'medicine'), [inventory])
  const totalUnits = useMemo(() => medicineItems.reduce((sum, i) => sum + i.quantity, 0), [medicineItems])
  const statusCounts = useMemo(() => {
    const counts = { 'Low Stock': 0, 'Critical Stock': 0, 'Out of Stock': 0, Expired: 0 }
    for (const i of medicineItems) {
      const s = getInventoryStatus(i)
      if (s in counts) counts[s]++
    }
    return counts
  }, [medicineItems])

  const movementRef = useRef(null)
  const topUsedRef = useRef(null)

  const movementConfig = useMemo(() => {
    if (monthlyMovement.length === 0) return null
    return {
      type: 'bar',
      data: {
        labels: monthlyMovement.map((m) => new Date(m.month).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })),
        datasets: [
          { label: 'Received', data: monthlyMovement.map((m) => m.received_qty), backgroundColor: '#1E7B5E', borderRadius: 6, maxBarThickness: 44, categoryPercentage: 0.6, barPercentage: 0.9 },
          { label: 'Released', data: monthlyMovement.map((m) => m.released_qty), backgroundColor: '#B8660A', borderRadius: 6, maxBarThickness: 44, categoryPercentage: 0.6, barPercentage: 0.9 },
        ],
      },
      options: themedOptions({
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, ...CHART_GRID_Y }, x: { ...CHART_GRID_X } },
      }),
    }
  }, [monthlyMovement])

  const topUsedConfig = useMemo(() => {
    if (topUsed.length === 0) return null
    return {
      type: 'bar',
      data: {
        labels: topUsed.map((m) => m.medicine_name),
        datasets: [{ label: 'Units released (last 30 days)', data: topUsed.map((m) => Number(m.total_released)), backgroundColor: '#6A3FA0', borderRadius: 6, maxBarThickness: 28, categoryPercentage: 0.6, barPercentage: 0.9 }],
      },
      options: themedOptions({
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, ...CHART_GRID_Y }, y: { ...CHART_GRID_X } },
      }),
    }
  }, [topUsed])

  useChart(movementRef, movementConfig)
  useChart(topUsedRef, topUsedConfig)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && (
        <div className="card" style={{ padding: 14, color: 'var(--danger)', fontSize: 13 }}>
          Failed to load some dashboard data: {error}
        </div>
      )}

      <div className="stats-row cols-3">
        <StatCard label="Current Stock" value={totalUnits.toLocaleString()} sub={`${medicineItems.length} medicines tracked`} Icon={InventoryIcon} color="blue" />
        <StatCard label="Low Stock" value={statusCounts['Low Stock']} Icon={AlertTriangleIcon} color="orange" onClick={() => onNavigateToStatus?.('Low Stock')} />
        <StatCard label="Critical Stock" value={statusCounts['Critical Stock']} Icon={AlertOctagonIcon} color="red" onClick={() => onNavigateToStatus?.('Critical Stock')} />
        <StatCard label="Out of Stock" value={statusCounts['Out of Stock']} Icon={PackageXIcon} color="red" onClick={() => onNavigateToStatus?.('Out of Stock')} />
        <StatCard label="Expiring in 90 Days" value={expiring90 === null ? '…' : expiring90} sub="batches" Icon={BellIcon} color="green" onClick={onNavigateToBatches} />
        <StatCard label="Expiring in 30 Days" value={expiring30 === null ? '…' : expiring30} sub="batches" Icon={BellIcon} color="orange" onClick={onNavigateToBatches} />
        <StatCard label="Expiring in 7 Days" value={expiring7 === null ? '…' : expiring7} sub="batches" Icon={BellIcon} color="red" onClick={onNavigateToBatches} />
        <StatCard label="Expired Items" value={statusCounts.Expired} Icon={AlertOctagonIcon} color="red" onClick={() => onNavigateToStatus?.('Expired')} />
        <StatCard label="Damaged Inventory" value={damagedCount === null ? '…' : damagedCount} sub="batches" Icon={TrashIcon} color="red" onClick={onNavigateToBatches} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <DownloadIcon width={15} height={15} /> Recently Received
            </h3>
          </div>
          {recentlyReceived.length === 0 ? (
            <div className="empty-state" style={{ padding: 24 }}>
              <p>{loading ? 'Loading…' : 'No receiving records yet'}</p>
            </div>
          ) : (
            <div style={{ padding: '4px 0' }}>
              {recentlyReceived.map((r) => (
                <div key={r.receiving_record_id} style={{ padding: '9px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <div>
                    <strong>{r.medicine_name}</strong>
                    <div style={{ color: 'var(--text-3)' }}>{formatDate(r.received_date)}</div>
                  </div>
                  <div style={{ fontWeight: 700, color: 'var(--success)' }}>
                    +{r.quantity} {r.unit}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <MinusIcon width={15} height={15} /> Recently Released
            </h3>
          </div>
          {recentlyReleased.length === 0 ? (
            <div className="empty-state" style={{ padding: 24 }}>
              <p>{loading ? 'Loading…' : 'No release activity yet'}</p>
            </div>
          ) : (
            <div style={{ padding: '4px 0' }}>
              {recentlyReleased.map((l) => (
                <div key={l.inventory_log_id} style={{ padding: '9px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <div>
                    <strong>{l.item_name}</strong>
                    <div style={{ color: 'var(--text-3)' }}>
                      {formatDateTime(l.created_at)} · {l.staff_name}
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, color: 'var(--danger)' }}>
                    {l.quantity_change} {l.unit}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <BarChartIcon width={15} height={15} /> Monthly Inventory Movement
          </h3>
        </div>
        <div style={{ padding: '10px 18px', height: 260 }}>
          {monthlyMovement.length === 0 ? (
            <div className="empty-state" style={{ padding: 24 }}>
              <p>{loading ? 'Loading…' : 'No movement recorded yet'}</p>
            </div>
          ) : (
            <canvas ref={movementRef} />
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <PillIcon width={15} height={15} /> Top Used Medicines <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-3)' }}>(last 30 days)</span>
          </h3>
        </div>
        <div style={{ padding: '10px 18px', height: Math.max(180, topUsed.length * 42) }}>
          {topUsed.length === 0 ? (
            <div className="empty-state" style={{ padding: 24 }}>
              <p>{loading ? 'Loading…' : 'No dispensing activity in the last 30 days'}</p>
            </div>
          ) : (
            <canvas ref={topUsedRef} />
          )}
        </div>
      </div>
    </div>
  )
}