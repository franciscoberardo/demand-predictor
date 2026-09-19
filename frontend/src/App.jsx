import { useCallback, useEffect, useMemo, useState } from 'react'
import { FiMoon, FiSun, FiActivity, FiArrowDown, FiArrowRight, FiArrowUpRight, FiBarChart2, FiBox, FiCalendar, FiCheck, FiChevronLeft, FiChevronRight, FiCpu, FiDownload, FiGrid, FiInfo, FiLayers, FiMenu, FiRefreshCw, FiSearch, FiSliders, FiTarget, FiTrendingUp, FiUsers, FiX, FiZap } from 'react-icons/fi'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { demoData } from './demoData'
import { buildDecisions, createHistory, shiftMonth } from './decisions'
import { AlertStrip, StockPanel, TrendsPanel, TrendBadge } from './components/DecisionPanels'
import ForecastDetail from './components/ForecastDetail'
import MetricGuide, { QuickHelp } from './components/MetricGuide'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
const EMPTY = []
const number = (value) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(value)
const monthKey = (date) => String(date ?? '').slice(0, 7)
const monthLabel = (date) => /^\d{4}-\d{2}$/.test(date) ? new Date(`${date}-15T12:00:00`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }) : 'Sin fecha'
const navItems = [{ name: 'Resumen', icon: FiGrid }, { name: 'Predicciones', icon: FiTrendingUp }, { name: 'Clientes', icon: FiUsers }, { name: 'Productos', icon: FiBox }, { name: 'Stock y reposición', icon: FiLayers }, { name: 'Tendencias', icon: FiActivity }]
const palette = ['#8063e8', '#9278ed', '#a18bf0', '#b19ff3', '#c0b1f6', '#cec2f8', '#d8cef9', '#e2dafa']

function aggregate(rows, type) {
  const map = new Map()
  rows.forEach((row) => {
    const id = row[`${type}Id`] ?? row[type]?.id ?? row[type]?.name ?? 'unknown'
    const entry = map.get(id) || { id, name: row[type]?.name || `Sin ${type === 'product' ? 'producto' : 'cliente'}`, prediction: 0, count: 0 }
    entry.prediction += Number(row.prediction) || 0
    entry.count += 1
    map.set(id, entry)
  })
  return [...map.values()].sort((a, b) => b.prediction - a.prediction)
}

function App() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('demand-ai-theme') === 'light' ? 'light' : 'dark' }
    catch { return 'dark' }
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('demand-ai-theme', theme) } catch { /* Storage may be disabled. */ }
  }, [theme])
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading')
  const [refresh, setRefresh] = useState(0)
  const [demo, setDemo] = useState(false)
  const [view, setView] = useState('Resumen')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [productFocus, setProductFocus] = useState(null)
  const [customerFocus, setCustomerFocus] = useState(null)
  const [selected, setSelected] = useState(null)
  const [stockFilter, setStockFilter] = useState('Todos')
  const [trendFilter, setTrendFilter] = useState('Todos los productos')
  const closeDetail = useCallback(() => setSelected(null), [])
  const [period, setPeriod] = useState('all')
  const [sort, setSort] = useState('desc')
  const [page, setPage] = useState(1)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (demo) return
    let disposed = false
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)
    fetch(`${API}/dashboard`, { signal: controller.signal })
      .then((res) => { if (!res.ok) throw new Error('Error del servidor'); return res.json() })
      .then((response) => {
        if (!response.metrics || !Array.isArray(response.forecasts)) throw new Error('Respuesta inválida')
        if (disposed) return
        setData(response)
        setStatus('ready')
      })
      .catch(() => { if (!disposed) setStatus('error') })
      .finally(() => clearTimeout(timeout))
    return () => { disposed = true; clearTimeout(timeout); controller.abort() }
  }, [refresh, demo])

  useEffect(() => {
    if (!notice) return
    const timeout = setTimeout(() => setNotice(''), 3500)
    return () => clearTimeout(timeout)
  }, [notice])

  useEffect(() => {
    if (demo) return
    const update = () => { if (document.visibilityState === 'visible') setRefresh((value) => value + 1) }
    const interval = setInterval(update, 5 * 60 * 1000)
    window.addEventListener('focus', update)
    return () => { clearInterval(interval); window.removeEventListener('focus', update) }
  }, [demo])

  const sourceData = demo ? demoData : data
  const history = useMemo(() => createHistory(sourceData?.history), [sourceData?.history])
  const forecasts = sourceData?.forecasts ?? EMPTY
  const metrics = (demo ? demoData : data)?.metrics
  const periods = useMemo(() => [...new Set(forecasts.map((row) => monthKey(row.date)).filter((date) => /^\d{4}-\d{2}$/.test(date)))].sort(), [forecasts])
  const decisionMonth = period !== 'all' ? period : periods.find((value) => value >= history.currentMonth) ?? periods.at(-1)
  const decisions = useMemo(() => buildDecisions(forecasts, sourceData?.catalog, decisionMonth, history), [forecasts, sourceData?.catalog, decisionMonth, history])
  const decisionView = view === 'Stock y reposición' || view === 'Tendencias'
  const baselineMonth = decisionMonth ? [shiftMonth(decisionMonth, -1), shiftMonth(history.currentMonth, -1)].sort()[0] : null
  const effectivePeriod = decisionView ? decisionMonth : period
  const scoped = useMemo(() => forecasts.filter((row) => effectivePeriod === 'all' || monthKey(row.date) === effectivePeriod), [forecasts, effectivePeriod])
  const products = useMemo(() => aggregate(scoped, 'product'), [scoped])
  const customers = useMemo(() => aggregate(scoped, 'customer'), [scoped])
  const total = scoped.reduce((sum, row) => sum + (Number(row.prediction) || 0), 0)
  const topShare = total > 0 ? Math.round((products[0]?.prediction || 0) / total * 100) : 0
  const grouped = view === 'Clientes' || view === 'Productos'
  const rows = useMemo(() => {
    const source = view === 'Clientes' ? customers : view === 'Productos' ? products : scoped
    const query = search.trim().toLocaleLowerCase('es')
    return source.filter((row) => !customerFocus || row.customerId === customerFocus.id).filter((row) => !productFocus || (row.productId ?? row.product?.id ?? row.product?.name) === productFocus.id).filter((row) => `${row.name || ''} ${row.customer?.name || ''} ${row.product?.name || ''}`.toLocaleLowerCase('es').includes(query)).sort((a, b) => sort === 'desc' ? b.prediction - a.prediction : a.prediction - b.prediction)
  }, [view, customers, products, scoped, search, sort, productFocus, customerFocus])
  const pageCount = Math.max(1, Math.ceil(rows.length / 7))
  const currentPage = Math.min(page, pageCount)
  const visible = rows.slice((currentPage - 1) * 7, currentPage * 7)
  const ready = demo || status === 'ready'

  function navigate(name) { window.scrollTo(0, 0); setView(name); setSearch(''); setProductFocus(null); setCustomerFocus(null); setSelected(null); setPage(1); setMobileOpen(false) }
  function navigateDecision(name, filter) {
    navigate(name)
    if (name === 'Stock y reposición') setStockFilter(filter || 'Todos')
    if (name === 'Tendencias') setTrendFilter(filter || 'Todos los productos')
  }
  function drillDown(item, isCustomer = false) {
    navigate('Predicciones')
    if (decisionMonth) setPeriod(decisionMonth)
    if (isCustomer) setCustomerFocus(item)
    else setProductFocus(item)
  }
  function exportStock(items) {
    downloadCsv([['Producto', 'Período', 'Stock actual', 'Demanda prevista', 'Estado', 'A reponer'], ...items.map((item) => [item.name, decisionMonth, item.stock, item.prediction, item.label, item.shortage])], `reposicion-${decisionMonth}`)
  }
  function reconnect() { setDemo(false); setStatus('loading'); setPeriod('all'); setPage(1); setRefresh((value) => value + 1) }
  function exportCsv() {
    const values = grouped
      ? [[view === 'Clientes' ? 'Cliente' : 'Producto', 'Predicciones', 'Demanda prevista'], ...rows.map((row) => [row.name, row.count, row.prediction])]
      : [['Cliente', 'Producto', 'Periodo', 'Demanda prevista'], ...rows.map((row) => [row.customer?.name, row.product?.name, monthKey(row.date), row.prediction])]
    downloadCsv(values, `${view.toLowerCase()}-${period}`)
  }
  function downloadCsv(values, name) {
    const escape = (value) => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`
    const blob = new Blob(['\ufeff' + values.map((row) => row.map(escape).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `demand-ai-${demo ? 'demo-' : ''}${name}.csv`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice(`${number(values.length - 1)} registros exportados${demo ? ' · Datos de demo' : ''}`)
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {mobileOpen && <button aria-label="Cerrar menú" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-slate-950/30 backdrop-blur-sm lg:hidden" />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col overflow-y-auto border-r border-line/80 bg-surface px-5 py-8 transition-transform lg:visible lg:translate-x-0 ${mobileOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'}`}>
        <a href="#" onClick={(event) => { event.preventDefault(); navigate('Resumen') }} className="flex items-center gap-2.5 px-2 text-[22px] font-bold tracking-tight"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-lg shadow-violet-200"><FiActivity size={22} /></span> demand<span className="-ml-1 text-accent-ink">ai</span><span className="ml-1 rounded border border-accent-line bg-accent-soft px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-accent-ink">PRO</span></a>
        <div className="mt-10 flex items-center gap-3 rounded-xl border border-line/80 bg-surface-soft/70 p-3"><span className="grid size-9 place-items-center rounded-lg border border-line bg-surface text-secondary"><FiLayers /></span><div><p className="text-xs font-semibold">Mi organización</p><p className="mt-1 text-[11px] text-subtle">Espacio de trabajo</p></div></div>
        <p className="mb-3 mt-8 px-3 text-[10px] font-semibold tracking-[0.16em] text-subtle">WORKSPACE</p>
        <nav aria-label="Navegación principal" className="space-y-1.5">{navItems.map(({ name, icon: Icon }) => <button key={name} onClick={() => navigate(name)} aria-current={view === name ? 'page' : undefined} className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-[13px] font-medium transition-colors ${view === name ? 'bg-accent-soft text-accent-ink' : 'text-muted hover:bg-surface-soft hover:text-ink'}`}><Icon size={18} />{name}{view === name && <span className="ml-auto size-1.5 rounded-full bg-violet-500" />}</button>)}</nav>
        <div className="mt-auto pt-8"><div className="relative overflow-hidden rounded-xl border border-accent-line bg-gradient-to-br from-accent-soft to-surface p-4"><FiCpu className="mb-3 text-accent-ink" size={23} /><p className="text-xs font-semibold">Decisiones con inteligencia</p><p className="mt-2 text-[11px] leading-5 text-muted">Transformá tus predicciones en un mejor plan de abastecimiento.</p><div className="mt-4 flex items-center gap-2 border-t border-accent-line pt-3 text-[10px] text-muted"><span className={`size-1.5 rounded-full ${ready ? 'bg-emerald-500' : 'bg-amber-400'}`} />{demo ? 'Entorno de demostración' : ready ? 'Datos conectados' : 'Esperando conexión'}</div></div><div className="mt-5 flex items-center gap-3 border-t border-line-soft px-1 pt-5"><div className="grid size-8 place-items-center rounded-full bg-surface-raised text-xs font-semibold text-muted">MI</div><div><p className="text-xs font-semibold">Mi espacio</p><p className="mt-0.5 text-[10px] text-subtle">Demand AI Analytics</p></div></div></div>
      </aside>

      <div className="lg:ml-60">
        <header className="flex h-[73px] items-center justify-between border-b border-line/70 bg-surface/80 px-5 sm:px-8 xl:px-10"><div className="flex items-center gap-3 text-xs"><button className="btn-icon lg:hidden" aria-label="Abrir menú" onClick={() => setMobileOpen(true)}><FiMenu /></button><span className="hidden text-subtle sm:inline">Workspace</span><FiChevronRight className="hidden text-faint sm:block" /><span className="font-medium">{view}</span></div><div className="flex items-center gap-2 sm:gap-4"><button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="control flex items-center gap-2" aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'} title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}>{theme === 'dark' ? <FiSun size={15} /> : <FiMoon size={15} />}<span className="hidden sm:inline">{theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}</span></button><span className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-medium ${demo ? 'bg-warning-soft text-warning-ink' : 'bg-surface-soft text-muted'}`}><span className={`size-1.5 rounded-full ${ready ? demo ? 'bg-amber-500' : 'bg-emerald-500' : 'bg-slate-400'}`} />{demo ? 'Modo demo' : ready ? 'Conectado' : status === 'loading' ? 'Conectando' : 'Sin conexión'}</span><span className="h-5 w-px bg-slate-200" /><span className="grid size-8 place-items-center rounded-full bg-accent-muted text-xs font-semibold text-accent-ink">MI</span></div></header>
        <main id="main" className="mx-auto max-w-[1600px] px-5 py-7 sm:px-8 xl:px-10">
          <div className="mb-7 flex flex-col justify-between gap-5 xl:flex-row xl:items-center"><div><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-ink"><span className="h-px w-5 bg-violet-400" />Demand intelligence</div><h1 className="text-[28px] font-semibold tracking-[-1px] sm:text-[30px]">{view === 'Resumen' ? 'Tu demanda, bajo control.' : view === 'Predicciones' ? 'Anticipá tu próxima decisión.' : view === 'Clientes' ? 'Conocé la demanda de tus clientes.' : view === 'Stock y reposición' ? 'Del pronóstico a la compra.' : view === 'Tendencias' ? 'Anticipá los cambios de demanda.' : 'El pulso de tus productos.'}</h1><p className="mt-2 text-xs leading-5 text-muted">{view === 'Resumen' ? 'Una visión clara de lo que viene. Decisiones que hacen crecer tu negocio.' : 'Explorá las proyecciones y encontrá dónde enfocar tu próxima acción.'}</p></div><div className="flex flex-wrap items-center gap-2.5"><div className="relative flex items-center"><FiCalendar className="pointer-events-none absolute left-3 text-subtle" size={14} /><select aria-label="Período" className="control max-w-52 pl-9 capitalize" value={decisionView ? decisionMonth ?? 'all' : period} onChange={(event) => { setPeriod(event.target.value); setPage(1) }}>{!decisionView && <option value="all">Todos los períodos</option>}{periods.map((value) => <option key={value} value={value}>{monthLabel(value)}</option>)}</select></div>{!decisionView && <button onClick={exportCsv} disabled={!ready || !rows.length} className="btn-primary"><FiDownload size={14} />Exportar reporte</button>}</div></div>

          {demo && <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning-line/60 bg-warning-soft px-4 py-2.5 text-xs text-warning-ink"><span className="flex items-center gap-2"><FiInfo />Vista de demostración · Los datos son ilustrativos.</span><button onClick={reconnect} className="font-semibold underline underline-offset-4">Conectar datos reales</button></div>}
          {!ready ? <section className="panel flex min-h-[520px] flex-col items-center justify-center px-6 text-center" aria-live="polite"><span className="mb-5 grid size-16 place-items-center rounded-2xl bg-accent-soft text-accent-ink"><FiActivity size={30} className={status === 'loading' ? 'animate-pulse' : ''} /></span><h2 className="text-xl font-semibold tracking-tight">{status === 'loading' ? 'Preparando tu visión de demanda' : 'Conectemos tu próximo gran paso'}</h2><p className="mt-3 max-w-md text-sm leading-6 text-muted">{status === 'loading' ? 'Estamos buscando las últimas predicciones de tu negocio.' : 'No pudimos obtener los datos del servidor. Volvé a intentar o explorá el dashboard con datos de demostración.'}</p>{status === 'error' && <div className="mt-6 flex flex-wrap justify-center gap-3"><button onClick={reconnect} className="control flex items-center gap-2"><FiRefreshCw />Reintentar</button><button onClick={() => { setDemo(true); setPeriod('all'); setPage(1) }} className="btn-primary">Explorar demo<FiArrowRight /></button></div>}</section> : <>
            <MetricGuide />
            {view === 'Resumen' && decisionMonth && <AlertStrip decisions={decisions} month={decisionMonth} baselineMonth={baselineMonth} available={history.available} onNavigate={navigateDecision} />}
            <section aria-label="Indicadores principales" className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:gap-5 xl:grid-cols-4">
              <Metric icon={FiTrendingUp} label="Demanda prevista" value={number(total)} unit="uds." note="Volumen estimado del período" featured />
              <Metric icon={FiUsers} label="Clientes con demanda" value={number(customers.length)} note={`${number(metrics?.customers ?? customers.length)} clientes en la base`} />
              <Metric icon={FiBox} label="Productos con demanda" value={number(products.length)} note={`${number(metrics?.products ?? products.length)} productos en el catálogo`} />
              <Metric icon={FiTarget} label="Error histórico · MAE" value={metrics?.modelMAE == null ? '—' : number(metrics.modelMAE)} unit={metrics?.modelMAE == null ? '' : 'uds.'} note="Error absoluto medio del modelo" />
            </section>
            {view === 'Resumen' && <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_310px]">
              <div className="panel min-w-0 p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold">¿Qué productos van a liderar?</h2><p className="mt-1.5 text-[11px] text-subtle">Los 8 productos con mayor demanda prevista</p></div><span className="flex items-center gap-1.5 rounded-md bg-accent-soft px-2.5 py-1.5 text-[10px] font-medium text-accent-ink"><span className="size-1.5 rounded-full bg-violet-400" />Unidades previstas</span></div><div className="mt-6 h-[255px] w-full" role="img" aria-label={`Ranking de demanda: ${products.slice(0, 8).map((item) => `${item.name}, ${number(item.prediction)} unidades`).join('; ') || 'Sin predicciones'}`}>
                {products.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={products.slice(0, 8)} margin={{ top: 8, right: 0, left: -22, bottom: 0 }} barCategoryGap="27%"><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="var(--chart-grid)" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} interval={0} tickMargin={12} tickFormatter={(value) => value.length > 11 ? `${value.slice(0, 10)}…` : value} /><YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} tickFormatter={(value) => Intl.NumberFormat('es', { notation: 'compact' }).format(value)} /><Tooltip cursor={{ fill: 'var(--accent-soft)', radius: 6 }} contentStyle={{ borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 12, boxShadow: '0 6px 24px #1e164010' }} formatter={(value) => [`${number(value)} uds.`, 'Demanda']} /><Bar dataKey="prediction" radius={[5, 5, 0, 0]} maxBarSize={48}>{products.slice(0, 8).map((item, index) => <Cell key={item.id} fill={palette[index]} />)}</Bar></BarChart></ResponsiveContainer> : <div className="grid h-full place-items-center text-sm text-subtle">No hay predicciones para este período.</div>}
              </div><div className="mt-3 flex items-center justify-between border-t border-line-soft pt-4 text-[10px] text-subtle"><span>Proyección por producto · {period === 'all' ? 'Todos los períodos' : monthLabel(period)}</span><button onClick={() => navigate('Productos')} className="flex items-center gap-1 font-medium text-accent-ink hover:text-accent-ink">Ver productos<FiArrowUpRight /></button></div></div>
              <div className="relative flex flex-col overflow-hidden rounded-2xl bg-[#25213c] p-6 text-white"><div className="pointer-events-none absolute -right-14 -top-14 size-60 rounded-full border border-white/5" /><div className="pointer-events-none absolute -right-6 -top-6 size-44 rounded-full border border-white/5" /><div className="flex items-center gap-2 text-[10px] font-medium tracking-widest text-violet-200"><FiZap size={15} />FOCO DEL PERÍODO</div><h2 className="mt-6 text-xl font-medium leading-7 tracking-tight">Un paso adelante<br />de la demanda.</h2><p className="mt-3 text-xs leading-6 text-[#b4aecb]">{products.length ? <><span className="font-medium text-white">{products[0].name}</span> concentra el <span className="text-white">{topShare}%</span> del volumen previsto. Priorizá la revisión de su abastecimiento.</> : 'Tus oportunidades aparecerán aquí cuando haya predicciones disponibles.'}</p><div className="my-5 h-px bg-surface/10" /><div className="flex items-end justify-between"><div><p className="text-[10px] text-[#b4aecb]">Demanda del producto líder</p><p className="mt-2 text-3xl font-semibold tracking-tight">{number(products[0]?.prediction || 0)}<span className="ml-2 text-xs font-normal text-[#b4aecb]">uds.</span></p></div><FiBarChart2 size={38} className="text-accent-subtle" /></div><button onClick={() => { navigate('Predicciones'); setProductFocus(products[0] || null) }} className="mt-6 flex items-center justify-between rounded-lg border border-white/15 bg-surface/5 px-3 py-2.5 text-xs font-medium transition-colors hover:bg-surface/10">Explorar oportunidad<FiArrowRight /></button></div>
            </section>}

            {view === 'Stock y reposición' && <StockPanel decisions={decisions} month={decisionMonth} filter={stockFilter} onFilter={setStockFilter} onProduct={drillDown} onExport={exportStock} />}
            {view === 'Tendencias' && <TrendsPanel decisions={decisions} month={decisionMonth} filter={trendFilter} onFilter={setTrendFilter} onSelect={drillDown} />}
            {!decisionView && <section className="panel mt-6 overflow-hidden" aria-label="Detalle de demanda"><div className="flex flex-col justify-between gap-4 p-5 sm:p-6 2xl:flex-row 2xl:items-center"><div className="shrink-0"><div className="flex items-center gap-2"><h2 className="text-sm font-semibold">{grouped ? `Demanda por ${view.toLowerCase()}` : 'Predicciones por cliente'}</h2><span className="rounded-md bg-surface-raised px-2 py-0.5 text-[10px] font-medium text-muted">{number(rows.length)}</span></div><p className="mt-1.5 text-[11px] text-subtle">{grouped ? 'Volumen consolidado para organizar tus prioridades' : 'El detalle que necesitás para planificar con confianza'}</p></div><div className="flex flex-wrap gap-2"><label className="control flex min-w-0 flex-1 items-center gap-2 sm:min-w-60"><FiSearch className="shrink-0 text-subtle" /><input aria-label="Buscar cliente o producto" className="w-full min-w-0 bg-transparent text-xs outline-none placeholder:text-subtle" placeholder={grouped ? `Buscar ${view.toLowerCase()}...` : 'Buscar cliente o producto...'} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} />{search && <button aria-label="Limpiar búsqueda" onClick={() => { setSearch(''); setPage(1) }}><FiX /></button>}</label><label className="control flex items-center gap-2"><FiSliders className="text-subtle" /><select aria-label="Ordenar por demanda" className="min-w-0 bg-transparent text-xs outline-none" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1) }}><option value="desc">Mayor demanda</option><option value="asc">Menor demanda</option></select></label></div></div>
              <div className="px-6 pb-4"><QuickHelp label="esta tabla">Demanda prevista = unidades que se espera vender. % del volumen = participación de esta fila en las {number(total)} unidades previstas de {period === 'all' ? 'todos los períodos seleccionados' : monthLabel(period)}; no cambia al buscar. Tendencia = cambio frente a las ventas del mes indicado debajo del porcentaje. Abrí una fila para ver el historial y una recomendación.</QuickHelp></div>
              {(productFocus || customerFocus) && <div className="border-t border-line-soft px-6 py-3"><button onClick={() => { setProductFocus(null); setCustomerFocus(null); setPage(1) }} className="inline-flex items-center gap-2 rounded-md bg-accent-soft px-3 py-1.5 text-xs text-accent-ink" aria-label="Quitar filtro de detalle">{(productFocus || customerFocus).name}<FiX /></button></div>}
              <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead className="border-y border-line-soft bg-surface-soft/80 text-[10px] font-medium uppercase tracking-wider text-subtle"><tr><th scope="col" className="px-6 py-3.5">{view === 'Productos' ? 'Producto' : 'Cliente'}</th><th scope="col" className="px-5 py-3.5">{grouped ? 'Predicciones' : 'Producto'}</th><th scope="col" className="px-5 py-3.5">Período</th><th scope="col" className="px-6 py-3.5 text-right"><button onClick={() => { setSort(sort === 'desc' ? 'asc' : 'desc'); setPage(1) }} className="ml-auto flex items-center gap-1.5">Demanda prevista<FiArrowDown className={sort === 'asc' ? 'rotate-180' : ''} /></button></th><th scope="col" className="px-6 py-3.5 text-right">% del volumen</th>{!grouped && <th scope="col" className="px-6 py-3.5">Tendencia</th>}</tr></thead><tbody>{visible.map((item, index) => { const name = grouped ? item.name : item.customer?.name || 'Sin cliente'; const share = total > 0 ? item.prediction / total * 100 : 0; return <tr key={item.id ?? `${item.customerId}-${item.productId}-${index}`} onClick={() => grouped ? drillDown(item, view === 'Clientes') : setSelected(item)} className="cursor-pointer border-b border-line-soft/80 transition-colors last:border-0 hover:bg-accent-soft/30"><td className="px-6 py-4"><div className="flex items-center gap-3"><span className={`grid size-8 shrink-0 place-items-center rounded-lg text-[10px] font-semibold ${index % 3 === 0 ? 'bg-accent-soft text-accent-ink' : index % 3 === 1 ? 'bg-blue-soft text-blue-ink' : 'bg-warning-soft text-warning-ink'}`}>{view === 'Productos' ? <FiBox size={14} /> : name.split(' ').map((word) => word[0]).slice(0, 2).join('').toUpperCase()}</span><button className="text-left font-medium text-secondary hover:text-accent-ink" aria-label={grouped ? `Ver predicciones de ${name}` : `Ver detalle de ${name}, ${item.product?.name}`} onClick={(event) => { event.stopPropagation(); if (grouped) drillDown(item, view === 'Clientes'); else setSelected(item) }}>{name}<span className="mt-1 block text-[10px] font-normal text-accent-ink">Ver detalle →</span></button></div></td><td className="px-5 py-4 text-muted">{grouped ? `${number(item.count)} registros` : item.product?.name || 'Sin producto'}</td><td className="whitespace-nowrap px-5 py-4 capitalize text-subtle">{grouped ? period === 'all' ? 'Todos los períodos' : monthLabel(period) : monthLabel(monthKey(item.date))}</td><td className="px-6 py-4 text-right"><span className="rounded-md bg-accent-soft px-2.5 py-1.5 font-semibold tabular-nums text-accent-ink">{number(item.prediction)}<span className="ml-1 text-[10px] font-normal text-accent-subtle">uds.</span></span></td><td className="px-6 py-4"><div className="flex items-center justify-end gap-2.5"><div className="h-1 w-14 overflow-hidden rounded-full bg-surface-raised"><div className="h-full rounded-full bg-violet-300" style={{ width: `${Math.min(100, share)}%` }} /></div><span className="w-10 text-right text-[11px] tabular-nums text-muted">{number(share)}%</span></div></td>{!grouped && <td className="px-6 py-4"><TrendBadge {...history.compare(item.prediction, monthKey(item.date), item.customerId, item.productId)} compact /><p className="mt-1 text-[9px] text-subtle">vs. {monthLabel(history.compare(item.prediction, monthKey(item.date), item.customerId, item.productId).baselineMonth)}</p></td>}</tr> })}</tbody></table></div>
              {!rows.length && <div className="px-5 py-14 text-center"><FiSearch className="mx-auto mb-3 text-faint" size={26} /><p className="text-sm font-medium">{search ? 'No encontramos coincidencias' : 'Todavía no hay predicciones'}</p><p className="mt-2 text-xs text-subtle">{search ? 'Probá con otro cliente o producto.' : 'Las proyecciones disponibles aparecerán en este espacio.'}</p>{search && <button className="mt-4 text-xs font-medium text-accent-ink" onClick={() => { setSearch(''); setPage(1) }}>Limpiar búsqueda</button>}</div>}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-6 py-4"><p className="text-[11px] text-subtle">Mostrando <span className="font-medium text-secondary">{rows.length ? (currentPage - 1) * 7 + 1 : 0}–{Math.min(currentPage * 7, rows.length)}</span> de <span className="font-medium text-secondary">{number(rows.length)}</span> resultados</p><div className="flex items-center gap-2"><button className="btn-icon" aria-label="Página anterior" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><FiChevronLeft /></button><span className="px-2 text-[11px] text-muted">{currentPage} / {pageCount}</span><button className="btn-icon" aria-label="Página siguiente" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}><FiChevronRight /></button></div></div>
            </section>}
            <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 pb-2 text-[10px] text-subtle"><span className="flex items-center gap-1.5"><FiCpu size={12} />Powered by Demand AI<span className="mx-1 text-faint">·</span>Inteligencia para tu negocio</span><span>{demo ? 'Datos ilustrativos.' : 'Actualización automática cada 5 min.'} Las predicciones son estimaciones.</span></footer>
          </>}
        </main>
      </div>
      {selected && <ForecastDetail item={selected} history={history} forecasts={forecasts} onClose={closeDetail} onStock={() => { setPeriod(monthKey(selected.date)); setSelected(null); navigateDecision('Stock y reposición') }} />}
      {notice && <div role="status" className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm text-white shadow-xl"><FiCheck className="text-emerald-400" />{notice}</div>}
    </div>
  )
}

function Metric({ icon: Icon, label, value, unit, note, featured }) {
  return <article className={`relative overflow-hidden rounded-xl border p-5 ${featured ? 'border-accent-line bg-gradient-to-br from-accent-muted via-accent-soft to-surface' : 'border-line/80 bg-surface'}`}><div className="flex items-center justify-between"><p className="text-[11px] font-medium text-muted">{label}</p><span className={`grid size-8 place-items-center rounded-lg ${featured ? 'bg-surface/80 text-accent-ink' : 'bg-surface-soft text-subtle'}`}><Icon size={16} /></span></div><div className="mt-3 flex items-baseline gap-2"><p className="text-[30px] font-semibold tracking-[-1px] tabular-nums">{value}</p>{unit && <span className="text-xs text-subtle">{unit}</span>}</div><p className={`mt-3 flex items-center gap-1.5 text-[10px] ${featured ? 'text-accent-ink' : 'text-subtle'}`}>{featured && <FiActivity size={11} />}{note}</p></article>
}

export default App
