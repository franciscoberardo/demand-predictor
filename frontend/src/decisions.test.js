import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDecisions, createHistory, inventoryState, shiftMonth, variation } from './decisions.js'

test('stock: faltante agregado, margen ajustado y datos ausentes', () => {
  assert.deepEqual(inventoryState(500, 890), { label: 'Faltante', tone: 'danger', shortage: 390, coverage: 500 / 890 * 100 })
  assert.equal(inventoryState(800, 720).label, 'Ajustado')
  assert.equal(inventoryState(650, 510).label, 'Correcto')
  assert.equal(inventoryState(0, 0).label, 'Correcto')
  assert.equal(inventoryState(null, 100).shortage, null)
  assert.equal(inventoryState(500, null).label, 'Sin datos')
})
test('variación: no produce infinito con una base cero', () => {
  assert.equal(variation(68, 57), 11 / 57 * 100)
  assert.equal(variation(10, 0), null)
  assert.equal(variation(0, 0), 0)
  assert.equal(variation(50, null), null)
  assert.equal(shiftMonth('2026-01', -1), '2025-12')
})
const monthly = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].flatMap((month) => [
  { month, customerId: 1, productId: 8, quantity: month === '2026-09' ? 2 : 60 },
  { month, customerId: 2, productId: 8, quantity: 40 },
])
const history = createHistory({ monthly, firstMonth: '2026-04', currentMonth: '2026-09' })
test('comparación excluye septiembre abierto y promedia tres meses cerrados', () => {
  const comparison = history.compare(72, '2026-10', 1, 8)
  assert.equal(comparison.baselineMonth, '2026-08')
  assert.equal(comparison.baseline, 60)
  assert.equal(comparison.average, 60)
  assert.equal(comparison.change, 20)
  assert.equal(history.compare(72, '2026-06', 1, 8).average, null)
  assert.equal(history.quantity('2026-03', 1, 8), null)
  assert.equal(history.quantity('2026-08', 99, 8), null)
})
test('reposición suma clientes y usa un único mes sin duplicar el stock', () => {
  const forecasts = [
    { customerId: 1, productId: 8, date: '2026-10-01', prediction: 72, customer: { name: 'A' }, product: { name: 'P', stock: 80 } },
    { customerId: 2, productId: 8, date: '2026-10-01', prediction: 50, customer: { name: 'B' }, product: { name: 'P', stock: 80 } },
    { customerId: 1, productId: 8, date: '2026-11-01', prediction: 500, customer: { name: 'A' }, product: { name: 'P', stock: 80 } },
  ]
  const result = buildDecisions(forecasts, [{ id: 8, name: 'P', stock: 80 }, { id: 9, name: 'Sin proyección', stock: 5 }], '2026-10', history)
  assert.equal(result.products[0].prediction, 122)
  assert.equal(result.shortages[0].shortage, 42)
  assert.equal(result.growing.length, 1)
  assert.equal(result.products.find((item) => item.id === 9).label, 'Sin datos')
  assert.equal(result.falling.length, 0)
})
test('umbrales estrictos y tendencias sin historial', () => {
  const rows = [{ customerId: 1, productId: 8, date: '2026-10-01', prediction: 48, customer: { name: 'A' }, product: { name: 'P', stock: 0 } }]
  assert.equal(buildDecisions(rows, [], '2026-10', history).falling.length, 0)
  assert.equal(buildDecisions([{ ...rows[0], prediction: 47 }], [], '2026-10', history).falling.length, 1)
  const result = buildDecisions(rows, [], '2026-10', createHistory(null))
  assert.equal(result.falling.length, 0)
  assert.equal(result.products[0].change, null)
  assert.equal(result.shortages.length, 1)
})

test('no interpreta como cero meses posteriores al último historial disponible', () => {
  const stale = createHistory({ monthly: monthly.filter((item) => item.month < '2026-08'), firstMonth: '2026-04', currentMonth: '2026-09' })
  assert.equal(stale.compare(72, '2026-10', 1, 8).baseline, null)
  assert.equal(stale.compare(72, '2026-10', 1, 8).change, null)
})
