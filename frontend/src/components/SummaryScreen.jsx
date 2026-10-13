import { useMemo, useState } from 'react'
import { FiAlertTriangle, FiDownload } from 'react-icons/fi'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const number = (value) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(value || 0)
const date = (value) => value ? new Date(`${value}T12:00:00Z`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '—'

function series(history, forecasts, productId) {
  const points = new Map()
  for (const row of history?.monthly ?? []) {
    if (row.productId !== productId) continue
    const point = points.get(row.month) ?? { month: row.month }
    point.sales = (point.sales ?? 0) + Number(row.quantity || 0)
    points.set(row.month, point)
  }
  for (const row of forecasts ?? []) {
    if (row.productId !== productId) continue
    const month = String(row.date).slice(0, 7)
    const point = points.get(month) ?? { month }
    point.forecast = (point.forecast ?? 0) + Number(row.prediction || 0)
    points.set(month, point)
  }
  return [...points.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-12)
}

export default function SummaryScreen({ history, forecasts, catalog, inventory, onProduct, onExport }) {
  const [tab, setTab] = useState('PEDIR')
  const [all, setAll] = useState(false)
  const counts = useMemo(() => ({ PEDIR: inventory.filter((item) => item.status === 'PEDIR').length, VIGILAR: inventory.filter((item) => item.status === 'VIGILAR').length }), [inventory])
  const decisions = useMemo(() => inventory.filter((item) => tab === 'Todos' || item.status === tab).sort((a, b) => (a.status === 'PEDIR' ? -1 : b.status === 'PEDIR' ? 1 : 0)), [inventory, tab])
  const shown = all ? decisions : decisions.slice(0, 3)
  const purchases = inventory.filter((item) => item.status === 'PEDIR')
  const priority = inventory.find((item) => item.status === 'PEDIR') ?? inventory.find((item) => item.status === 'VIGILAR')
  const reviewCount = counts.PEDIR + counts.VIGILAR
  const reviewMessage = reviewCount ? `Hay ${reviewCount} ${reviewCount === 1 ? 'producto para revisar' : 'productos para revisar'}: ${counts.PEDIR ? `${counts.PEDIR} ${counts.PEDIR === 1 ? 'requiere' : 'requieren'} compra` : ''}${counts.PEDIR && counts.VIGILAR ? ' y ' : ''}${counts.VIGILAR ? `${counts.VIGILAR} ${counts.VIGILAR === 1 ? 'está' : 'están'} en vigilancia` : ''}.` : 'No hay productos que requieran revisión en el horizonte disponible.'
  return <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(250px,3fr)] xl:items-start"><div className="space-y-7">
    <section aria-label="Cola de decisiones"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4"><h2 className="text-sm font-semibold">Cola de decisiones</h2><div className="flex rounded-lg border border-line bg-surface p-1">{[['PEDIR', 'Pedir', counts.PEDIR], ['VIGILAR', 'Vigilar', counts.VIGILAR], ['Todos', 'Todos', inventory.length]].map(([value, label, count]) => <button key={value} onClick={() => { setTab(value); setAll(false) }} className={`rounded-md px-3 py-1.5 text-xs transition-colors ${tab === value ? 'bg-accent-soft font-medium text-accent-ink' : 'text-muted hover:text-ink'}`}>{label} <span className="ml-1 opacity-70">{count}</span></button>)}</div></div>
      {priority && <div className={`mt-4 rounded-xl border border-[#FF6B7A]/50 border-l-4 border-l-[#FF6B7A] bg-[#FF6B7A]/[0.06] p-4`}><span className="text-[10px] font-medium uppercase tracking-wider text-[#FF6B7A]">Atención requerida</span><p className="mt-1 text-sm font-semibold text-white">{reviewMessage}</p><p className="mt-2 text-xs text-muted">El sistema recomienda iniciar las compras urgentes antes de sus fechas límite para evitar quiebres de stock.</p></div>}
      <div className="mt-4 space-y-4">{shown.map((item) => <DecisionCard key={item.productId} item={item} history={history} forecasts={forecasts} onProduct={onProduct} />)}</div>
      {!shown.length && <div className="panel mt-4 grid min-h-36 place-items-center p-6 text-center text-sm text-muted">No hay productos en esta categoría.</div>}
      {decisions.length > 3 && <div className="mt-4 text-center"><button onClick={() => setAll(!all)} className="text-xs font-medium text-accent-ink">{all ? 'Ver menos' : `Ver ${decisions.length - 3} decisiones más`}</button></div>}
    </section>
    <section className="panel overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 p-5"><div><h2 className="text-sm font-semibold">Plan de compras</h2><p className="mt-1 text-[11px] text-subtle">Recomendaciones priorizadas por urgencia</p></div><button onClick={() => onExport(purchases)} disabled={!purchases.length} className="btn-primary"><FiDownload size={14} />Exportar compras</button></div><div className="divide-y divide-line-soft">{purchases.slice(0, 5).map((item) => <button key={item.productId} onClick={() => onProduct(item.productId)} className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-accent-soft/25"><span className="font-medium text-sm">{item.name}</span><span className="text-xs text-muted">{number(item.suggestedQuantity)} uds.</span><span className="text-xs text-muted">{item.orderDeadline ? `Antes del ${date(item.orderDeadline)}` : 'Sin fecha'}</span>{item.shortageBeforeArrival && <span className="text-xs text-danger-ink">Entrega tardía</span>}</button>)}</div>{!purchases.length && <p className="p-5 text-sm text-muted">No hay compras urgentes dentro del horizonte disponible.</p>}</section>
  </div><InsightRail history={history} forecasts={forecasts} catalog={catalog} inventory={inventory} /></div>
}

function DecisionCard({ item, history, forecasts, onProduct }) {
  const data = useMemo(() => series(history, forecasts, item.productId), [history, forecasts, item.productId])
  const urgent = item.status === 'PEDIR'
  const futureDemand = item.timeline?.find((point) => point.month === item.nextMonth)?.demand
  const message = urgent ? `Comprar ${number(item.suggestedQuantity)} unidades${item.orderDeadline ? ` antes del ${date(item.orderDeadline)}` : ''}.` : item.estimatedStockoutDate ? `Controlar antes del quiebre estimado: ${date(item.estimatedStockoutDate)}.` : 'Revisar el abastecimiento en el próximo ciclo.'
  const tone = urgent ? '#FF6B7A' : '#F5B544'
  return <article className="panel overflow-hidden border-l-4 p-5 sm:p-6" style={{ borderLeftColor: tone }}><div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className={`rounded px-2 py-1 text-[10px] font-medium ${urgent ? 'bg-[#FF6B7A]/15 text-[#FF6B7A]' : 'bg-[#F5B544]/15 text-[#F5B544]'}`}>{item.status}</span><h3 className="text-sm font-semibold text-secondary">{item.name}</h3></div><p className="mt-2 text-xs text-muted">{message}</p></div><button onClick={() => onProduct(item.productId)} className="text-xs font-medium text-accent-ink">Ver detalle →</button></div><div className="grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(190px,3fr)]"><div className="h-48 min-w-0">{data.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}><CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="month" tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} tickFormatter={(value) => value.slice(5)} axisLine={false} tickLine={false} /><YAxis tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 12 }} /><Line dataKey="sales" name="Ventas reales" stroke="#9B6DFF" strokeWidth={2} dot={false} connectNulls={false} /><Line dataKey="forecast" name="Demanda proyectada" stroke="#6EA8FF" strokeWidth={2.5} dot={false} connectNulls={false} /></LineChart></ResponsiveContainer> : <div className="grid h-full place-items-center rounded-lg bg-surface-soft text-xs text-subtle">Sin datos para el gráfico</div>}</div><aside className="grid content-center gap-4 rounded-xl border border-line bg-surface-soft/50 p-4 text-sm"><Info label="Stock actual" value={`${number(item.stock)} uds.`} /><Info label="Demanda futura" value={futureDemand == null ? '—' : `${number(futureDemand)} uds.`} /><Info label="Compra sugerida" value={item.suggestedQuantity ? `${number(item.suggestedQuantity)} uds.` : '—'} emphasize={urgent} /><Info label="Quiebre estimado" value={date(item.estimatedStockoutDate)} critical={Boolean(item.estimatedStockoutDate)} urgent={urgent} /></aside></div><div className="mt-4 flex items-center gap-2 border-t border-line-soft pt-4 text-xs text-muted"><FiAlertTriangle className={urgent ? 'text-[#FF6B7A]' : 'text-[#F5B544]'} />{message}</div></article>
}
function InsightRail({ history, forecasts, catalog, inventory }) {
  const priceByProduct = new Map(catalog.map((product) => [product.id, Number(product.price)]))
  const forecastMonths = [...new Set(forecasts.map((row) => String(row.date).slice(0, 7)))].sort()
  const nextForecastMonth = forecastMonths.find((month) => month > history?.currentMonth) ?? forecastMonths[0]
  const projectedRevenue = forecasts.filter((row) => String(row.date).slice(0, 7) === nextForecastMonth).reduce((sum, row) => sum + Number(row.prediction || 0) * (priceByProduct.get(row.productId) || 0), 0)
  const revenueAvailable = projectedRevenue > 0 && priceByProduct.size > 0
  const stockouts = inventory.filter((item) => item.estimatedStockoutDate).sort((a, b) => a.estimatedStockoutDate.localeCompare(b.estimatedStockoutDate)).slice(0, 3)
  const counts = ['PEDIR', 'VIGILAR', 'OK'].map((status) => ({ status, count: inventory.filter((item) => item.status === status).length }))
  return <aside className="space-y-4 xl:sticky xl:top-5"><RailPanel title="Ingresos proyectados para el mes siguiente" featured>{revenueAvailable ? <><p className="text-3xl font-semibold tracking-tight text-[#55D6A0]">${number(projectedRevenue)}</p><p className="mt-3 text-[11px] leading-5 text-muted">Potencial para {nextForecastMonth}. Basado en forecast y precios actuales.</p></> : <Empty text="No hay precios disponibles para estimar ingresos." />}</RailPanel><RailPanel title="Estado de abastecimiento"><div className="mt-2 grid grid-cols-3 gap-2">{counts.map(({ status, count }) => <div key={status} className="rounded-lg bg-surface-soft p-3 text-center"><p className={`text-lg font-semibold ${status === 'PEDIR' ? 'text-[#FF6B7A]' : status === 'VIGILAR' ? 'text-[#F5B544]' : 'text-[#55D6A0]'}`}>{count}</p><p className="mt-1 text-[9px] text-subtle">{status}</p></div>)}</div></RailPanel><RailPanel title="Próximos quiebres">{stockouts.length ? <div className="space-y-4">{stockouts.map((item) => <div key={item.productId} className="flex items-center justify-between gap-3 text-xs"><span className="truncate text-secondary">{item.name}</span><span className={item.status === 'PEDIR' ? 'text-[#FF6B7A]' : 'text-[#F5B544]'}>{date(item.estimatedStockoutDate)}</span></div>)}</div> : <Empty text="Sin quiebres estimados." />}</RailPanel></aside>
}
function RailPanel({ title, children, featured = false }) { return <section className={`panel min-h-40 p-5 ${featured ? 'border-success-line bg-success-soft/30' : ''}`}><h2 className="text-xs font-semibold">{title}</h2><div className="mt-4">{children}</div></section> }
function Empty({ text = 'Sin datos suficientes.' }) { return <p className="text-[11px] text-subtle">{text}</p> }
function Info({ label, value, emphasize = false, critical = false, urgent = false }) { return <div><p className="text-[10px] uppercase tracking-wide text-subtle">{label}</p><p className={`mt-1 font-medium ${emphasize ? 'text-[#FF6B7A]' : critical ? urgent ? 'text-[#FF6B7A]' : 'text-[#F5B544]' : 'text-secondary'}`}>{value}</p></div> }
