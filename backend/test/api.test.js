const { test } = require('node:test');
const assert = require('node:assert/strict');
test('API integration with local PostgreSQL (opt-in)', { skip: !process.env.TEST_DATABASE }, async () => {
  const { app, prisma } = require('../src/server');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function get(path) { const response = await fetch(base + path); assert.equal(response.status, 200); return response.json(); }
  try {
    const dashboard = await get('/dashboard');
    const inventory = await get('/inventory');
    assert.deepEqual(dashboard.inventory, inventory);
    assert.ok(inventory.length > 0);
    assert.deepEqual(await get('/inventory?risk=true'), inventory.filter(p => p.stockoutRisk));
    const id = inventory[0].productId;
    const detail = await get(`/products/${id}`);
    assert.deepEqual(detail.inventory, inventory[0]);
    assert.ok(detail.history.length > 0);
    const forecasts = await get(`/forecasts?productId=${id}`);
    assert.ok(forecasts.every(p => p.productId === id));
    assert.equal(new Set(forecasts.map(p => p.date.slice(0, 7))).size, 7);
    const keys = dashboard.forecasts.map(p => `${p.customerId}:${p.productId}:${p.date}`);
    assert.equal(keys.length, new Set(keys).size);
    for (const [path, status] of [['/products/no', 400], ['/products/2147483647', 404], ['/forecasts?productId=-1', 400], ['/inventory?risk=other', 400]]) assert.equal((await fetch(base + path)).status, status);
    console.log(JSON.stringify({ forecasts: keys.length, products: inventory.length, orderNow: inventory.filter(p => p.orderNow).length, coverageComplete: inventory.filter(p => p.coverageComplete).length }));
  } finally { await new Promise(resolve => server.close(resolve)); await prisma.$disconnect(); }
});
