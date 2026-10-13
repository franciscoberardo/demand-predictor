import { useEffect, useRef, useState } from 'react'
import { FiAlertTriangle, FiBox, FiX } from 'react-icons/fi'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatNumber as n, monthLabel } from '../decisions'

const date = value => value ? new Date(`${value}T12:00:00Z`).toLocaleDateString('es-AR', { timeZone: 'UTC' }) : '—'
export function PurchaseAdvice({ item }) {
  if (!item) return <p>Planificación no disponible. Actualizá el backend y generá el forecast.</p>
  const needsPurchase = item.nextMonthShortage > 0 || item.orderNow
  return <div className="space-y-2 text-xs leading-6 text-secondary">
    <p>{needsPurchase ? item.suggestedQuantity != null && item.purchaseTargetMonth ? <><strong>Pedí {n(item.suggestedQuantity)} uds.</strong> para cubrir hasta fin de {monthLabel(item.purchaseTargetMonth)}.</> : 'Falta forecast para calcular la compra.' : item.nextMonthShortage === 0 ? 'El stock alcanza hasta fin del próximo mes.' : 'Faltan datos para evaluar el próximo mes.'}</p>
    {item.orderNow && item.purchaseTargetMonth > item.nextMonth && <p className="text-warning-ink">El plazo de {item.leadTimeDays} días exige anticipar esta compra.</p>}
    {needsPurchase && item.orderDeadline && <p>{item.orderNow ? 'Pedir hoy' : `Pedir a más tardar el ${date(item.orderDeadline)}`} · Quiebre estimado: {date(item.estimatedStockoutDate)}.</p>}
    {item.monthlyPurchases?.filter(order => order.orderNow).slice(1).map(order => <p key={order.targetMonth} className="text-warning-ink">Por el plazo de entrega: anticipá también {n(order.quantity)} uds. para {monthLabel(order.targetMonth)}.</p>)}
    {needsPurchase && item.shortageBeforeArrival && <p className="text-danger-ink"><FiAlertTriangle className="mr-1 inline" />La entrega llegaría tarde. Pedí hoy y adelantá la llegada.</p>}
  </div>
}
export default function InventoryPanel({ inventory, onProduct, onExport }) {
  const [filter, setFilter] = useState('Todos')
  const [search, setSearch] = useState('')
  if (!inventory) return <section className="panel my-6 p-6">Planificación no disponible en estos datos. Conectá el backend actualizado para consultar recomendaciones con lead time.</section>
  const focused = inventory.map(p => ({ ...p, status: p.orderNow ? 'PEDIR' : p.nextMonthShortage == null || p.nextMonthShortage > 0 ? 'VIGILAR' : 'OK', shortTerm: p.timeline?.find(point => point.month === p.nextMonth) }))
  const rows = focused.filter(p => (filter === 'Todos' || p.status === filter) && p.name.toLowerCase().includes(search.toLowerCase()))
  const risk = focused.filter(p => p.nextMonthShortage > 0).sort((a, b) => (a.estimatedStockoutDate || '').localeCompare(b.estimatedStockoutDate || ''))
  return <section className="panel my-6 overflow-hidden" aria-label="Planificación de inventario">
    <div className="flex flex-wrap justify-between gap-4 p-5 sm:p-6"><div><h2 className="text-lg font-semibold">Productos que requieren atención</h2><p className="mt-1.5 text-xs text-muted">{risk.length} con posible quiebre dentro del horizonte actual.</p></div><button className="btn-primary" onClick={() => onExport(rows)} disabled={!rows.length}>Exportar compras</button></div>
    <div className="flex flex-wrap justify-between gap-3 p-6"><div className="flex gap-2">{['Todos', 'PEDIR', 'VIGILAR', 'OK'].map(value => <button className={`control ${filter === value ? 'text-accent-ink' : ''}`} aria-pressed={filter === value} onClick={() => setFilter(value)} key={value}>{value}</button>)}</div><input className="control" aria-label="Buscar producto en inventario" placeholder="Buscar producto" value={search} onChange={e => setSearch(e.target.value)} /></div>
    <div className="overflow-x-auto"><table className="decision-table"><thead><tr>{['Producto', 'Stock actual', 'Cantidad sugerida', 'Estado', ''].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(p => <tr key={p.productId}><td><button className="font-semibold text-accent-ink" onClick={() => onProduct(p.productId)}><FiBox className="mr-2 inline" />{p.name}</button></td><td>{n(p.stock)} uds.</td><td className="font-medium">{p.suggestedQuantity ? `${n(p.suggestedQuantity)} uds.` : '—'}</td><td><span className={`rounded-md px-2 py-1 text-[11px] font-medium ${p.status === 'PEDIR' ? 'bg-danger-soft text-danger-ink' : p.status === 'VIGILAR' ? 'bg-warning-soft text-warning-ink' : 'bg-success-soft text-success-ink'}`}>{p.status}</span></td><td><button className="text-xs font-medium text-accent-ink" onClick={() => onProduct(p.productId)}>Ver detalle →</button></td></tr>)}</tbody></table></div>
    {!rows.length && <p className="p-6 text-sm text-muted">No hay productos para este filtro.</p>}
    <details className="p-6 text-xs leading-6 text-muted"><summary className="cursor-pointer">Cómo se calcula</summary><p>Demanda uniforme por día de cada mes. PEDIR: la fecha límite llegó. VIGILAR: pedido futuro o cobertura incompleta. OK: stock suficiente hasta fin del próximo mes. Los pedidos que requieren anticipación por lead time siguen visibles. La primera compra cubre el resto del mes actual y el próximo mes con faltante. Las siguientes se calculan mes a mes, descontando las compras propuestas anteriores. Cada fecha límite considera el lead time; un plazo largo puede exigir anticipar varios pedidos. No incluye stock de seguridad, reservas ni compras pendientes.</p></details>
  </section>
}
export function ProductDetail({ productId, source, onClose, onForecasts }) {
  const dialog = useRef(null)
  const [expanded, setExpanded] = useState(false)
  useEffect(() => { const previous = document.activeElement; dialog.current.showModal(); return () => previous?.focus() }, [])
  const product = source.catalog?.find(p => p.id === productId)
  const item = source.inventory?.find(p => p.productId === productId)
  const points = new Map()
  for (const row of source.history?.monthly ?? []) {
    if (row.productId !== productId) continue
    const point = points.get(row.month) ?? { month: row.month }
    point.sales = (point.sales ?? 0) + row.quantity
    points.set(row.month, point)
  }
  for (const row of source.forecasts.filter(p => p.productId === productId)) {
    const month = row.date.slice(0, 7)
    const point = points.get(month) ?? { month }
    point.forecast = (point.forecast ?? 0) + row.prediction
    points.set(month, point)
  }
  for (const row of item?.timeline ?? []) points.set(row.month, { ...points.get(row.month), ...row })
  const chart = [...points.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-19)
  return <dialog aria-labelledby="product-detail-title" ref={dialog} onCancel={onClose} onClick={e => { if (e.target === dialog.current) onClose() }} className="m-auto max-h-[90vh] w-[95vw] max-w-5xl overflow-auto rounded-2xl bg-canvas p-6 text-ink backdrop:bg-slate-950/60">
    <header className="mb-6 flex items-center justify-between"><h2 id="product-detail-title" className="text-xl font-semibold">{product?.name ?? 'Producto'} · Plan de abastecimiento</h2><button className="btn-icon" aria-label="Cerrar producto" onClick={onClose}><FiX /></button></header>
    <div className="grid gap-4 sm:grid-cols-4">{[['Stock actual', product?.stock], ['Lead time (días)', product?.leadTimeDays], ['Demanda hasta fin del próximo mes', item?.timeline?.find(point => point.month === item.nextMonth)?.demand], ['Stock al cierre sin compras', item?.timeline?.find(point => point.month === item.nextMonth)?.projectedStock]].map(([label, value]) => <div className="panel p-4" key={label}><p className="text-xs text-muted">{label}</p><p className="mt-2 text-xl">{n(value)}</p></div>)}</div>
    <p className="mt-3 text-xs text-muted">Desde {date(item?.asOf)} hasta fin de {monthLabel(item?.nextMonth)}.</p>
    <div className="panel my-5 p-5"><PurchaseAdvice item={item} /></div>
    <button className="btn-primary mb-5" onClick={() => onForecasts({ id: productId, name: product?.name })}>Ver predicciones por cliente</button>
    <details className="panel p-5" onToggle={event => setExpanded(event.currentTarget.open)}><summary className="cursor-pointer text-sm font-semibold">Ver proyección de varios meses y calendario de compras</summary>
    <p className="mt-4 text-xs text-muted">Hasta {date(item?.horizonEnd)} (fin exclusivo): demanda {n(item?.projectedDemand)} uds. · Faltante total sin nuevas compras: {n(item?.horizonShortage)} uds.</p>
    {item && <section className="panel my-5 overflow-hidden"><div className="p-5"><h3 className="text-sm font-semibold">Compras propuestas mes a mes</h3><p className="mt-2 text-xs text-muted">Próximo mes: {monthLabel(item.nextMonth)} · Demanda del mes: {n(item.nextMonthDemand)} uds. · Faltante desde hoy hasta su cierre: {n(item.nextMonthShortage)} uds.</p></div><div className="overflow-x-auto"><table className="decision-table"><thead><tr><th>Cubrir hasta fin de</th><th>Unidades a pedir</th><th>Pedir a más tardar</th><th>Acción</th></tr></thead><tbody>{item.monthlyPurchases?.map(order => <tr key={order.targetMonth}><td>{monthLabel(order.targetMonth)}</td><td>{n(order.quantity)}</td><td>{date(order.orderDeadline)}</td><td>{order.shortageBeforeArrival ? 'Pedir hoy y acelerar entrega' : order.orderNow ? 'Pedir hoy' : `Programar para ${date(order.recommendedOrderDate)}`}</td></tr>)}</tbody></table></div><p className="p-5 text-xs leading-6 text-muted">Cada lote cubre sólo el faltante de su período. Los meses posteriores suponen que comprás y recibís los lotes anteriores a tiempo; son propuestas, no órdenes confirmadas. Si una entrega ya llegaría tarde, hay que resolver ese faltante. El plan se recalcula con la fecha y el stock actuales.</p></section>}
    <h3 className="text-sm font-semibold">Proyección de varios meses · sin compras nuevas</h3>{expanded && <div className="my-5 h-80"><ResponsiveContainer width="100%" height="100%"><LineChart data={chart}><CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" /><XAxis dataKey="month" tick={{ fill: 'var(--chart-tick)', fontSize: 11 }} /><YAxis tick={{ fill: 'var(--chart-tick)', fontSize: 11 }} /><Tooltip labelFormatter={monthLabel} contentStyle={{ background: 'var(--surface)', color: 'var(--ink)' }} /><Legend /><Line dataKey="sales" name="Ventas reales" stroke="#94a3b8" connectNulls={false} /><Line dataKey="forecast" name="Forecast mensual" stroke="#a78bfa" connectNulls={false} /><Line dataKey="projectedStock" name="Stock al cierre sin reposición" stroke="#f59e0b" connectNulls={false} /></LineChart></ResponsiveContainer></div>}
    <p className="text-xs text-muted">El mes actual contiene ventas parciales. El forecast representa el mes completo; la planificación descuenta sólo la demanda desde hoy. Stock negativo representa demanda sin cubrir.</p>
    </details>
  </dialog>
}
