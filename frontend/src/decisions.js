export const monthKey = (value) => String(value ?? '').slice(0, 7)
export const formatNumber = (value) => value == null ? '—' : new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(value)
export const monthLabel = (month) => /^\d{4}-\d{2}$/.test(month ?? '') ? new Date(`${month}-15T12:00:00Z`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'Sin período'
export function shiftMonth(month, delta) {
  const [year, value] = month.split('-').map(Number)
  return new Date(Date.UTC(year, value - 1 + delta, 1)).toISOString().slice(0, 7)
}
export function variation(prediction, baseline) {
  if (baseline == null || prediction == null) return null
  if (baseline === 0) return prediction === 0 ? 0 : null
  return (prediction - baseline) / baseline * 100
}
export function inventoryState(stock, demand) {
  if (stock == null || !Number.isFinite(Number(stock)) || demand == null) return { label: 'Sin datos', tone: 'neutral', shortage: null, coverage: null }
  const shortage = Math.max(0, Math.ceil(demand - stock))
  const coverage = demand > 0 ? stock / demand * 100 : null
  return { shortage, coverage, ...(shortage > 0 ? { label: 'Faltante', tone: 'danger' } : demand > 0 && stock <= demand * 1.15 ? { label: 'Ajustado', tone: 'warning' } : { label: 'Correcto', tone: 'success' }) }
}

export function createHistory(history) {
  const monthly = history?.monthly ?? []
  const lastMonth = monthly.reduce((latest, item) => item.month > latest ? item.month : latest, '')
  const totals = new Map()
  const firstByScope = new Map()
  for (const item of monthly) {
    const scopes = [`c:${item.customerId}`, `p:${item.productId}`, `cp:${item.customerId}:${item.productId}`]
    for (const scope of scopes) {
      totals.set(`${scope}:${item.month}`, (totals.get(`${scope}:${item.month}`) ?? 0) + item.quantity)
      if (!firstByScope.has(scope) || item.month < firstByScope.get(scope)) firstByScope.set(scope, item.month)
    }
  }
  const currentMonth = history?.currentMonth ?? monthKey(new Date().toISOString())
  function scopeKey(customerId, productId) {
    return customerId != null && productId != null ? `cp:${customerId}:${productId}` : customerId != null ? `c:${customerId}` : `p:${productId}`
  }
  function quantity(month, customerId, productId) {
    const scope = scopeKey(customerId, productId)
    const first = firstByScope.get(scope)
    // Do not extrapolate zeros before a relationship's first recorded sale.
    if (!first || !history?.firstMonth || month < first || month < history.firstMonth || month > currentMonth || month > lastMonth) return null
    return totals.get(`${scope}:${month}`) ?? 0
  }
  function compare(prediction, forecastMonth, customerId, productId) {
    const baselineMonth = [shiftMonth(forecastMonth, -1), shiftMonth(currentMonth, -1)].sort()[0]
    // The first month in the dataset may have incomplete coverage.
    const baseline = baselineMonth <= history?.firstMonth ? null : quantity(baselineMonth, customerId, productId)
    const months = [-2, -1, 0].map((offset) => shiftMonth(baselineMonth, offset))
    const values = months.map((month) => month <= history?.firstMonth ? null : quantity(month, customerId, productId))
    const average = values.every((value) => value != null) ? values.reduce((a, b) => a + b, 0) / 3 : null
    return { baselineMonth, baseline, average, averageMonths: months, change: variation(prediction, baseline), averageChange: variation(prediction, average) }
  }
  return { quantity, compare, currentMonth, available: !!history && monthly.length > 0 }
}

export function buildDecisions(forecasts, catalog, month, history) {
  if (!month) return { products: [], customers: [], shortages: [], falling: [], growing: [] }
  const rows = forecasts.filter((item) => monthKey(item.date) === month)
  const byProduct = new Map()
  const byCustomer = new Map()
  for (const row of rows) {
    const product = byProduct.get(row.productId) ?? { id: row.productId, name: row.product?.name, stock: row.product?.stock ?? null, prediction: 0 }
    product.prediction += Number(row.prediction)
    byProduct.set(row.productId, product)
    const customer = byCustomer.get(row.customerId) ?? { id: row.customerId, name: row.customer?.name, prediction: 0 }
    customer.prediction += Number(row.prediction)
    byCustomer.set(row.customerId, customer)
  }
  // Include catalog items without forecasts, but never label them as covered.
  for (const product of catalog ?? []) {
    const existing = byProduct.get(product.id)
    byProduct.set(product.id, { ...product, ...existing, stock: product.stock ?? null, prediction: existing?.prediction ?? null })
  }
  const products = [...byProduct.values()].map((item) => ({ ...item, ...inventoryState(item.stock, item.prediction), ...history.compare(item.prediction, month, null, item.id) })).sort((a, b) => (b.shortage ?? -1) - (a.shortage ?? -1) || (b.prediction ?? 0) - (a.prediction ?? 0))
  const customers = [...byCustomer.values()].map((item) => ({ ...item, ...history.compare(item.prediction, month, item.id, null) })).sort((a, b) => (a.change ?? Infinity) - (b.change ?? Infinity))
  return { products, customers, shortages: products.filter((item) => item.shortage > 0), falling: customers.filter((item) => item.change != null && item.change < -20), growing: products.filter((item) => item.change != null && item.change > 15) }
}

export function stockAdvice(stock, demand) {
  const state = inventoryState(stock, demand)
  if (state.shortage == null) return 'Completá el stock y la predicción antes de decidir una compra.'
  if (state.shortage > 0) return `El stock no alcanza para la demanda prevista. Revisá reponer ${formatNumber(state.shortage)} uds.; antes, descontá pedidos en camino y verificá las reservas.`
  if (demand === 0) return 'No hay demanda prevista para este período. Validá las necesidades con tus clientes antes de sumar stock.'
  const margin = stock - demand
  if (state.label === 'Ajustado') return `El stock alcanza, pero quedarían solo ${formatNumber(margin)} uds. de margen. Revisá los plazos de entrega y prepará una reposición si aumenta la demanda.`
  return `El stock cubre la proyección y dejaría ${formatNumber(margin)} uds. de margen. No surge una reposición por faltante; revisá reservas y evolución de ventas antes de comprar más.`
}
