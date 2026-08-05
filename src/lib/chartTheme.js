// Shared Chart.js visual theme — grid lines, font, and tooltip styling
// applied consistently across every chart in the app (line, bar,
// doughnut), so they all share one clean look instead of each chart
// having its own ad-hoc defaults. Doesn't dictate chart TYPE or data —
// a category breakdown still makes sense as a doughnut, a monthly trend
// still makes sense as a line — this just makes them all look like they
// belong to the same design system.

export const CHART_FONT = { family: "'DM Sans', sans-serif", size: 11 }

// Light, minimal gridlines — only horizontal by default, no vertical
// lines, no axis border — matches a clean "reference chart" look instead
// of Chart.js's boxier default grid.
export const CHART_GRID_Y = {
  grid: { color: 'rgba(148,163,184,.18)', drawTicks: false },
  border: { display: false },
  ticks: { font: CHART_FONT, color: '#8A8078' },
}
export const CHART_GRID_X = {
  grid: { display: false },
  border: { display: false },
  ticks: { font: CHART_FONT, color: '#8A8078' },
}

// White, rounded, drop-shadowed tooltip with a colored dot next to each
// value (usePointStyle) — mirrors the reference design's tooltip card
// instead of Chart.js's plain dark default tooltip.
export const CHART_TOOLTIP = {
  enabled: true,
  backgroundColor: '#fff',
  titleColor: '#1A1310',
  bodyColor: '#3E332C',
  borderColor: 'rgba(208,200,188,.7)',
  borderWidth: 1,
  cornerRadius: 10,
  padding: 10,
  titleFont: { ...CHART_FONT, weight: '700', size: 12 },
  bodyFont: CHART_FONT,
  displayColors: true,
  usePointStyle: true,
  boxPadding: 4,
}

export const CHART_LEGEND_LABELS = { font: CHART_FONT, usePointStyle: true, padding: 14 }

/**
 * Shallow-merges the shared theme into a chart's own `options`, without
 * clobbering options a specific chart already set on purpose (legend
 * visibility, indexAxis, custom scale ticks, etc.) — those win over the
 * theme defaults since they're spread in after.
 */
export function themedOptions(options = {}) {
  return {
    ...options,
    plugins: {
      ...options.plugins,
      tooltip: { ...CHART_TOOLTIP, ...options.plugins?.tooltip },
      legend: options.plugins?.legend
        ? { labels: CHART_LEGEND_LABELS, ...options.plugins.legend }
        : options.plugins?.legend,
    },
  }
}

// Smooth line + soft gradient-fill area preset, matching the reference
// design's trend-line look — pass a canvas 2D context to build the
// actual gradient (needs real pixel dimensions, so it can't be a static
// object like the rest of this file).
export function lineAreaDataset({ label, data, color = '#1E7B5E', ctx, chartHeight = 200 }) {
  let backgroundColor = `${color}22`
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, chartHeight)
    gradient.addColorStop(0, `${color}33`)
    gradient.addColorStop(1, `${color}00`)
    backgroundColor = gradient
  }
  return {
    label,
    data,
    borderColor: color,
    backgroundColor,
    borderWidth: 2.5,
    tension: 0.4,
    fill: true,
    pointBackgroundColor: '#fff',
    pointBorderColor: color,
    pointBorderWidth: 2,
    pointRadius: 4,
    pointHoverRadius: 6,
  }
}