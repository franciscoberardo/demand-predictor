import { useEffect, useRef } from 'react'
import { FiAlertTriangle, FiArrowRight, FiBox, FiCalendar, FiX } from 'react-icons/fi'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatNumber as n, monthKey, monthLabel, shiftMonth, inventoryState, stockAdvice } from '../decisions'
import { TrendBadge } from './DecisionPanels'

export default function ForecastDetail({ item, history, forecasts, onClose, onStock }) {
  const dialog = useRef(null)
  const closeButton = useRef(null)
  const month = monthKey(item.date)
  const comparison = history.compare(item.prediction, month, item.customerId, item.productId)
  const productDemand = forecasts.filter((row) => row.productId === item.productId && monthKey(row.date) === month).reduce((sum, row) => sum + Number(row.prediction), 0)
  const inventory = inventoryState(item.product?.stock, productDemand)
  const chart = Array.from({ length: 7 }, (_, index) => {
    const value = shiftMonth(month, index - 6)
    const sales = value < month ? history.quantity(value, item.customerId, item.productId) : null
    return { month: value, sales, prediction: value === month ? item.prediction : index === 5 ? sales : null }
  })

  useEffect(() => {
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButton.current?.focus()
    function keydown(event) {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab') return
      const elements = [...dialog.current.querySelectorAll('button, [href], input, select, [tabindex="0"]')].filter((element) => !element.disabled)
      const first = elements[0]
      const last = elements.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); previous?.focus() }
  }, [onClose])

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-3 backdrop-blur-sm sm:p-6" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}><section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="forecast-detail-title" className="max-h-[92dvh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-canvas shadow-2xl"><header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-surface px-5 py-5 sm:px-8"><div><p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-accent-ink">Detalle de la predicción</p><h2 id="forecast-detail-title" className="text-xl font-semibold tracking-tight">{item.customer?.name} <span className="text-faint">/</span> {item.product?.name}</h2><p className="mt-2 flex items-center gap-1.5 text-xs capitalize text-muted"><FiCalendar />{monthLabel(month)}</p></div><button ref={closeButton} onClick={onClose} className="btn-icon" aria-label="Cerrar detalle"><FiX /></button></header><div className="space-y-5 p-5 sm:p-8"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><DetailMetric label="Promedio de 3 meses cerrados" value={comparison.average} suffix="uds." /><DetailMetric label={`Predicción · ${monthLabel(month)}`} value={item.prediction} suffix="uds." featured /><div className="rounded-xl border border-line bg-surface p-4"><p className="text-[11px] leading-4 text-muted">Variación vs. promedio</p><p className="my-3 text-2xl font-semibold">{comparison.averageChange == null ? '—' : `${comparison.averageChange > 0 ? '+' : ''}${n(comparison.averageChange)}%`}</p><p className="text-[10px] text-subtle">{comparison.average === 0 ? 'Base histórica igual a cero' : 'Últimos 3 meses cerrados'}</p></div><DetailMetric label="Stock actual del producto" value={item.product?.stock ?? null} suffix="uds." note="Compartido entre todos los clientes" /></div>
    <div className="panel p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Historial de demanda</h3><p className="mt-1.5 text-[11px] text-muted">Ventas reales y proyección de esta combinación cliente + producto</p></div><TrendBadge {...comparison} compact /></div><div className="mt-5 h-64" role="img" aria-label={`Historial: ${chart.map((point) => `${monthLabel(point.month)}: ${point.sales == null ? 'sin ventas históricas disponibles' : `${n(point.sales)} vendidas`}${point.month === month ? `, predicción ${n(item.prediction)}` : ''}`).join('; ')}`}><ResponsiveContainer width="100%" height="100%"><LineChart data={chart} margin={{ top: 15, right: 18, bottom: 5, left: -20 }}><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="var(--chart-grid)" /><XAxis dataKey="month" tickFormatter={(value) => monthLabel(value).slice(0, 3)} tick={{ fontSize: 11, fill: 'var(--chart-tick)' }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 11, fill: 'var(--chart-tick)' }} axisLine={false} tickLine={false} /><Tooltip labelFormatter={monthLabel} formatter={(value, name) => [`${n(value)} uds.`, name]} contentStyle={{ borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 12 }} /><Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} /><Line type="linear" dataKey="sales" name="Ventas registradas" stroke="#94a3b8" strokeWidth={2} dot={{ r: 4, fill: '#fff', strokeWidth: 2 }} connectNulls={false} /><Line type="linear" dataKey="prediction" name="Predicción" stroke="var(--accent-ink)" strokeWidth={3} strokeDasharray="5 4" dot={{ r: 5, fill: 'var(--accent-ink)' }} connectNulls={false} /></LineChart></ResponsiveContainer></div><p className="mt-3 text-[11px] leading-5 text-muted">Comparación mensual contra {monthLabel(comparison.baselineMonth)}: {n(comparison.baseline)} uds. Promedio de {monthLabel(comparison.averageMonths[0])} a {monthLabel(comparison.averageMonths[2])}. El mes actual puede contener ventas parciales; no se usa como referencia. Los huecos indican historial no disponible.</p></div>
    <div className={`rounded-xl border p-5 ${inventory.shortage > 0 ? 'border-danger-line bg-danger-soft' : 'border-accent-line bg-accent-soft'}`}><div className="flex items-start gap-3"><FiAlertTriangle className={inventory.shortage > 0 ? 'mt-0.5 shrink-0 text-rose-500' : 'mt-0.5 shrink-0 text-accent-ink'} size={20} /><div><h3 className="text-sm font-semibold">{inventory.shortage == null ? 'Stock no disponible' : inventory.shortage > 0 ? `Riesgo de faltante del producto: ${n(inventory.shortage)} unidades` : `Cobertura del producto: ${inventory.label.toLowerCase()}`}</h3><p className="mt-2 text-xs leading-6 text-secondary">La demanda de este cliente es de <strong>{n(item.prediction)} uds.</strong> La demanda total del producto para {monthLabel(month)} es de <strong>{n(productDemand)} uds.</strong>, frente a <strong>{n(item.product?.stock ?? null)} uds.</strong> de stock compartido. El stock no está asignado a un cliente específico.</p><p className="mt-3 rounded-lg bg-surface/60 p-3 text-xs leading-6 text-secondary"><strong>Qué podés hacer: </strong>{stockAdvice(item.product?.stock, productDemand)}</p><button onClick={onStock} className="mt-3 flex items-center gap-2 text-xs font-semibold text-accent-ink"><FiBox />Ver plan de reposición<FiArrowRight /></button></div></div></div>
    {!history.available && <p role="status" className="text-xs text-warning-ink">El servidor todavía no entregó ventas históricas. La predicción y el stock siguen disponibles.</p>}
    </div></section></div>
}
function DetailMetric({ label, value, suffix, note, featured }) { return <div className={`rounded-xl border p-4 ${featured ? 'border-accent-line bg-accent-soft' : 'border-line bg-surface'}`}><p className="text-[11px] leading-4 text-muted">{label}</p><p className="my-3 text-2xl font-semibold">{n(value)} <span className="text-xs font-normal text-subtle">{suffix}</span></p>{note && <p className="text-[10px] leading-4 text-subtle">{note}</p>}</div> }
