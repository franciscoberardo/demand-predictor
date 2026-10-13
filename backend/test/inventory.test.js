const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planInventory } = require('../src/services/inventory');
const product = (stock = 5, leadTimeDays = 45) => ({ id: 1, name: 'A', stock, leadTimeDays });
const forecast = (date, prediction, customerId = 1) => ({ productId: 1, date, prediction, customerId });
function plan(p, rows, date = '2026-01-01') { return planInventory([p], rows, new Date(`${date}T00:00:00Z`))[0]; }
const rows = [forecast('2026-01-01', 31), forecast('2026-02-01', 28), forecast('2026-03-01', 31)];
test('anticipates shortage within lead time and flags late arrival', () => {
  const p = plan(product(), rows);
  assert.equal(p.demandDuringLeadTime, 45);
  assert.equal(p.estimatedStockoutDate, '2026-01-06');
  assert.equal(p.orderDeadline, '2025-11-22');
  assert.equal(p.recommendedOrderDate, '2026-01-01');
  assert.equal(p.status, 'PEDIR');
  assert.equal(p.shortageBeforeArrival, true);
  assert.equal(p.suggestedQuantity, 54);
  assert.equal(p.horizonShortage, 85);
  assert.equal(p.projectedStock, -85);
});
test('future shortage schedules a future purchase', () => {
  const p = plan(product(70, 15), rows);
  assert.equal(p.status, 'VIGILAR');
  assert.equal(p.estimatedStockoutDate, '2026-03-12');
  assert.equal(p.recommendedOrderDate, '2026-02-25');
  assert.equal(p.suggestedQuantity, 20);
});
test('shared stock aggregates all customers', () => {
  const p = plan(product(100, 15), [...rows, forecast('2026-01-01', 31, 2)]);
  assert.equal(p.projectedDemand, 121);
  assert.equal(p.suggestedQuantity, 21);
});
test('prorates current month and respects leap years', () => {
  const p = plan(product(100, 10), [forecast('2024-02-01', 29), forecast('2024-03-01', 31)], '2024-02-20');
  assert.equal(p.demandDuringLeadTime, 10);
  assert.equal(p.projectedDemand, 41);
  assert.equal(p.status, 'OK');
});
test('missing current or interior month is unknown, not zero demand', () => {
  for (const values of [[], rows.slice(1), [rows[0], rows[2]]]) {
    const p = plan(product(1000), values);
    assert.equal(p.status, 'VIGILAR');
    assert.equal(p.coverageComplete, false);
    assert.equal(p.stockoutRisk, null);
    assert.equal(p.suggestedQuantity, null);
  }
});
test('short horizon never claims safety beyond coverage', () => {
  const p = plan(product(1000, 60), rows.slice(0, 1));
  assert.equal(p.coverageComplete, false);
  assert.equal(p.status, 'VIGILAR');
});
test('zero stock with demand needs action, zero demand does not', () => {
  assert.equal(plan(product(0, 0), rows).status, 'PEDIR');
  assert.equal(plan(product(0, 0), [forecast('2026-01-01', 0), forecast('2026-02-01', 0)]).status, 'OK');
});
test('old forecasts do not consume current stock', () => {
  assert.equal(plan(product(100, 0), [...rows, forecast('2025-12-01', 9999)]).projectedDemand, 90);
});

test('exact coverage through horizon needs no purchase', () => { assert.equal(plan(product(90, 15), rows).status, 'OK'); assert.equal(plan(product(90, 15), rows).suggestedQuantity, 0); });


test('Product 1 buys 764 for October, not the 5720 horizon shortage', () => {
  const values = [943, 936, 1286, 1286, 738, 722, 924].map((value, i) => forecast(new Date(Date.UTC(2026, 8+i, 1)).toISOString(), value));
  const p = plan(product(550, 15), values, '2026-09-19');
  assert.equal(p.suggestedQuantity, 764);
  assert.equal(p.purchaseTargetMonth, '2026-10');
  assert.equal(p.nextMonthDemand, 936);
  assert.equal(p.orderDeadline, '2026-09-21');
  assert.equal(p.horizonShortage, 5720);
  assert.deepEqual(p.monthlyPurchases.map(o => o.quantity), [764, 1286, 1286, 738, 722, 924]);
  assert.equal(p.monthlyPurchases.reduce((total, o) => total + o.quantity, 0), 5720);
});
test('long lead times can require several monthly orders now', () => {
  const p = plan(product(5, 60), rows);
  assert.equal(p.monthlyPurchases.filter(o => o.orderNow).length, 2);
  assert.equal(p.monthlyPurchases[1].quantity, 31);
  assert.equal(p.monthlyPurchases[1].orderDeadline, '2025-12-31');
});
test('month rollover recalculates from actual stock, not previous proposals', () => {
  const p = plan(product(20, 15), rows, '2026-02-01');
  assert.equal(p.nextMonth, '2026-03');
  assert.equal(p.suggestedQuantity, 39);
  assert.equal(p.orderDeadline, '2026-02-06');
});
test('missing next month cannot produce a monthly quantity', () => {
  const p = plan(product(5, 15), [rows[0], rows[2]]);
  assert.equal(p.suggestedQuantity, null);
  assert.deepEqual(p.monthlyPurchases, []);
});
test('zero-demand months and rounding do not duplicate supply', () => {
  const p = plan(product(10, 15), [forecast('2026-01-01', 11), forecast('2026-02-01', 0), forecast('2026-03-01', 31)], '2026-01-20');
  assert.equal(p.nextMonthShortage, 0);
  assert.equal(p.purchaseTargetMonth, '2026-03');
  assert.equal(p.suggestedQuantity, 26);
});
