import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { monthLabel } from '../decisions'

export default function DemandChart({ history, forecasts, productId, customerId, title = 'Ventas y demanda proyectada' }) {
  const points = new Map()
  for (const row of history?.monthly ?? []) {
    if ((productId && row.productId !== productId) || (customerId && row.customerId !== customerId)) continue
    const point = points.get(row.month) ?? { month: row.month }
    point.sales = (point.sales ?? 0) + Number(row.quantity || 0)
    points.set(row.month, point)
  }
  for (const row of forecasts ?? []) {
    if ((productId && row.productId !== productId) || (customerId && row.customerId !== customerId)) continue
    const month = String(row.date).slice(0, 7)
    const point = points.get(month) ?? { month }
    point.forecast = (point.forecast ?? 0) + Number(row.prediction || 0)
    points.set(month, point)
  }
  const data = [...points.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-12)
  return <section className="panel min-w-0 p-5 sm:p-6">
    <div className="mb-5 flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-[11px] text-subtle">Ventas registradas y forecast disponible</p></div><div className="flex gap-3 text-[10px] text-muted"><span><i className="mr-1 inline-block size-2 rounded-full bg-slate-400" />Ventas</span><span><i className="mr-1 inline-block size-2 rounded-full bg-violet-400" />Forecast</span></div></div>
    <div className="h-[280px]">{data.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}><CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="month" tickFormatter={(value) => monthLabel(value).slice(0, 3)} tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip labelFormatter={monthLabel} contentStyle={{ borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 12 }} formatter={(value) => [`${new Intl.NumberFormat('es-AR').format(value)} uds.`, undefined]} /><Legend wrapperStyle={{ fontSize: 11 }} /><Line type="monotone" dataKey="sales" name="Ventas reales" stroke="#94a3b8" strokeWidth={2} dot={false} connectNulls={false} /><Line type="monotone" dataKey="forecast" name="Demanda proyectada" stroke="#9b7cf5" strokeWidth={2.5} dot={false} connectNulls={false} /></LineChart></ResponsiveContainer> : <div className="grid h-full place-items-center text-sm text-subtle">No hay historial ni forecast para este filtro.</div>}</div>
  </section>
}
