import { useEffect, useMemo, useRef } from 'react'
import Chart from 'chart.js/auto'
import StatusBadge from '@components/ui/StatusBadge'
import { TrendingUpIcon, TagIcon, PillIcon, RefreshCwIcon, FolderIcon, BarChartIcon } from '@components/ui/icons'
import { themedOptions, lineAreaDataset, CHART_GRID_X, CHART_GRID_Y } from '@lib/chartTheme'

const PALETTE = ['#1E7B5E', '#6A3FA0', '#2E7D52', '#B8660A', '#C0392B', '#1A7A8A', '#DB2777', '#65A30D', '#EA580C', '#6366F1']

function useChart(canvasRef, config) {
  useEffect(() => {
    if (!canvasRef.current || !config) return undefined
    const chart = new Chart(canvasRef.current, config)
    return () => chart.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config])
}

export default function AnalyticsTab({ consultations, categories }) {
  const monthlyRef = useRef(null)
  const diagRef = useRef(null)
  const medsRef = useRef(null)
  const visitsRef = useRef(null)

  const diagCount = useMemo(() => {
    const m = {}
    consultations.forEach((c) => {
      const d = c.diagnosis || 'Unspecified'
      m[d] = (m[d] || 0) + 1
    })
    return m
  }, [consultations])
  const topDiags = useMemo(() => Object.entries(diagCount).sort((a, b) => b[1] - a[1]).slice(0, 10), [diagCount])

  const topMeds = useMemo(() => {
    const m = {}
    consultations.forEach((c) => {
      if (!c.medications || c.medications === 'None') return
      c.medications.split(',').forEach((med) => {
        const parts = med.trim().split(' ')
        const key = `${parts[0] || ''} ${parts[1] || ''}`.trim()
        if (key) m[key] = (m[key] || 0) + 1
      })
    })
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [consultations])

  const { months, monthlyCount } = useMemo(() => {
    const m = {}
    consultations.forEach((c) => {
      const ym = c.visit_date?.slice(0, 7) || '0000-00'
      m[ym] = (m[ym] || 0) + 1
    })
    return { months: Object.keys(m).sort(), monthlyCount: m }
  }, [consultations])

  const visitTypes = useMemo(() => {
    const m = {}
    consultations.forEach((c) => {
      m[c.visit_type] = (m[c.visit_type] || 0) + 1
    })
    return m
  }, [consultations])

  const topCats = useMemo(() => {
    const m = {}
    Object.entries(categories).forEach(([cat, diags]) => {
      diags.forEach((d) => {
        if (diagCount[d]) m[cat] = (m[cat] || 0) + diagCount[d]
      })
    })
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [categories, diagCount])

  useChart(monthlyRef, {
    type: 'line',
    data: {
      labels: months.map((m) => {
        const [y, mo] = m.split('-')
        return new Date(y, parseInt(mo, 10) - 1).toLocaleString('default', { month: 'short', year: '2-digit' })
      }),
      datasets: [
        lineAreaDataset({
          label: 'Consultations',
          data: months.map((m) => monthlyCount[m] || 0),
          color: '#1E7B5E',
          ctx: monthlyRef.current?.getContext('2d'),
          chartHeight: 220,
        }),
      ],
    },
    options: themedOptions({
      responsive: true,
      interaction: { intersect: false, mode: 'index' },
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 }, ...CHART_GRID_Y },
        x: { ...CHART_GRID_X },
      },
    }),
  })

  useChart(
    diagRef,
    topDiags.length
      ? {
          type: 'bar',
          data: {
            labels: topDiags.map(([d]) => (d.length > 25 ? d.substring(0, 23) + '…' : d)),
            datasets: [{ data: topDiags.map(([, c]) => c), backgroundColor: PALETTE, borderRadius: 6, maxBarThickness: 28, categoryPercentage: 0.6, barPercentage: 0.9 }],
          },
          options: themedOptions({
            indexAxis: 'y',
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
              x: { beginAtZero: true, ticks: { stepSize: 1 }, ...CHART_GRID_Y },
              y: { ...CHART_GRID_X },
            },
          }),
        }
      : null
  )

  useChart(
    medsRef,
    topMeds.length
      ? {
          type: 'bar',
          data: {
            labels: topMeds.map(([m]) => m.substring(0, 20)),
            datasets: [{ data: topMeds.map(([, c]) => c), backgroundColor: PALETTE.slice(2), borderRadius: 6, maxBarThickness: 28, categoryPercentage: 0.6, barPercentage: 0.9 }],
          },
          options: themedOptions({
            indexAxis: 'y',
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
              x: { beginAtZero: true, ticks: { stepSize: 1 }, ...CHART_GRID_Y },
              y: { ...CHART_GRID_X },
            },
          }),
        }
      : null
  )

  // Keyed by visit type so a color is never accidentally assigned by
  // array position — Object.keys(visitTypes)'s order depends on which
  // visit_type appears first in the data, not a fixed sequence, so an
  // index-based color array (the previous approach) could silently swap
  // colors if Emergency happened to be encountered before Walk-in.
  const VISIT_TYPE_COLORS = { 'Walk-in': '#1E7B5E', Emergency: '#C0392B' }

  useChart(visitsRef, {
    type: 'doughnut',
    data: {
      labels: Object.keys(visitTypes),
      datasets: [{ data: Object.values(visitTypes), backgroundColor: Object.keys(visitTypes).map((t) => VISIT_TYPE_COLORS[t] || '#94A3B8'), borderWidth: 2 }],
    },
    options: themedOptions({ responsive: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } }),
  })

  return (
    <div className="analytics-grid">
      <div className="card analytics-full">
        <div className="card-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><TrendingUpIcon width={15} height={15} /> Monthly Consultation Trend</h3>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{consultations.length} total records</span>
        </div>
        <div style={{ padding: 18 }}>
          <canvas ref={monthlyRef} height="120" />
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><TagIcon width={15} height={15} /> Top 10 Diagnoses</h3>
        </div>
        <div style={{ padding: 18 }}>
          <canvas ref={diagRef} height="260" />
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><PillIcon width={15} height={15} /> Most Prescribed Medicines</h3>
        </div>
        <div style={{ padding: 18 }}>
          <canvas ref={medsRef} height="260" />
        </div>
      </div>

      <div className="card analytics-narrow">
        <div className="card-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><RefreshCwIcon width={15} height={15} /> Visit Types</h3>
        </div>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <canvas ref={visitsRef} width="160" height="160" />
          <div style={{ width: '100%' }}>
            {Object.entries(visitTypes).map(([t, c]) => (
              <div key={t} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                <span>
                  <StatusBadge status={t} />
                </span>
                <strong>{c}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card analytics-narrow">
        <div className="card-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><FolderIcon width={15} height={15} /> By Category</h3>
        </div>
        <div style={{ padding: '12px 16px' }}>
          {topCats.map(([cat, count]) => {
            const pct = Math.round((count / consultations.length) * 100)
            return (
              <div key={cat} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span style={{ fontWeight: 600 }}>{cat}</span>
                  <span style={{ color: 'var(--primary)', fontWeight: 700 }}>
                    {count} <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({pct}%)</span>
                  </span>
                </div>
                <div className="diag-bar-wrap">
                  <div className="diag-bar-fill" style={{ transform: `scaleX(${pct / 100})`, background: 'linear-gradient(90deg,var(--primary),#7C3AED)' }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="card analytics-full">
        <div className="card-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><BarChartIcon width={15} height={15} /> Diagnosis Summary Table</h3>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Diagnosis</th>
                <th>Category</th>
                <th>Count</th>
                <th>% of Total</th>
                <th>Trend</th>
              </tr>
            </thead>
            <tbody>
              {topDiags.map(([diag, count], i) => {
                const pct = Math.round((count / consultations.length) * 100)
                const cat = Object.entries(categories).find(([, d]) => d.includes(diag))?.[0] || 'Other'
                return (
                  <tr key={diag}>
                    <td style={{ color: 'var(--text-3)' }}>{i + 1}</td>
                    <td>
                      <strong>{diag}</strong>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{cat}</td>
                    <td style={{ fontWeight: 700, color: 'var(--primary)', fontSize: 16 }}>{count}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div className="diag-bar-wrap" style={{ width: 80 }}>
                          <div className="diag-bar-fill" style={{ transform: `scaleX(${pct / 100})` }} />
                        </div>
                        <span style={{ fontSize: 12 }}>{pct}%</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 2 }}>
                        {Array.from({ length: 5 }).map((_, barIdx) => (
                          <div
                            key={barIdx}
                            style={{
                              width: 6,
                              height: 14,
                              borderRadius: 2,
                              background: barIdx < Math.min(count, 5) ? 'var(--primary)' : 'var(--border)',
                            }}
                          />
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}