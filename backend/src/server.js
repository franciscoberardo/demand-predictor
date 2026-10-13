const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const fs = require('node:fs');
function modelMAE() {
  try { const value = JSON.parse(fs.readFileSync(path.join(__dirname, '../../ml/metrics.json'), 'utf8')).mae; return Number.isFinite(value) ? value : null; } catch { return null; }
}
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

const { planInventory } = require('./services/inventory');
const prisma = new PrismaClient();
const app = express();
app.use(cors());
app.use(express.json());
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/dashboard', async (req, res) => {
  try {
    const [customers, catalog, forecasts, monthly] = await Promise.all([
      prisma.customer.count(),
      prisma.product.findMany({ orderBy: { id: 'asc' } }),
      prisma.forecast.findMany({
        where: { date: { gte: new Date(new Date().toISOString().slice(0, 7) + '-01T00:00:00Z') } },
        include: { customer: true, product: true },
        orderBy: [{ customerId: 'asc' }, { productId: 'asc' }],
      }),
      // Aggregate transactions in the database; no individual sale or price is sent.
      prisma.$queryRaw`
        SELECT "customerId", "productId", TO_CHAR("date", 'YYYY-MM') AS month,
               SUM(quantity)::float8 AS quantity
        FROM "Sale"
        GROUP BY "customerId", "productId", TO_CHAR("date", 'YYYY-MM')
        ORDER BY month ASC, "customerId" ASC, "productId" ASC
      `,
    ]);
    const asOf = new Date().toISOString();
    const inventory = planInventory(catalog, forecasts, new Date(asOf));
    res.json({
      inventory,
      metrics: {
        customers, products: catalog.length,
        totalPredicted: forecasts.reduce((total, item) => total + item.prediction, 0),
        modelMAE: modelMAE(),
        productsAtRisk: inventory.filter(p => p.stockoutRisk).length,
        productsToOrderNow: inventory.filter(p => p.orderNow).length,
      },
      forecasts,
      catalog,
      history: {
        monthly,
        firstMonth: monthly[0]?.month ?? null,
        currentMonth: asOf.slice(0, 7),
        asOf,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error obteniendo dashboard' });
  }
});

// Read endpoints share the same business rules as the dashboard.
app.get('/api/forecasts', async (req, res, next) => {
  try {
    const where = {};
    for (const key of ['productId', 'customerId']) {
      if (req.query[key] != null) {
        if (!/^[1-9]\d*$/.test(req.query[key]) || !Number.isSafeInteger(Number(req.query[key]))) return res.status(400).json({ error: `${key} inválido` });
        where[key] = Number(req.query[key]);
      }
    }
    where.date = { gte: new Date(new Date().toISOString().slice(0, 7) + '-01T00:00:00Z') };
    res.json(await prisma.forecast.findMany({ where, include: { customer: true, product: true }, orderBy: [{ date: 'asc' }, { productId: 'asc' }, { customerId: 'asc' }] }));
  } catch (error) { next(error); }
});
app.get('/api/inventory', async (req, res, next) => {
  try {
    if (req.query.risk != null && !['true', 'false'].includes(req.query.risk)) return res.status(400).json({ error: 'risk debe ser true o false' });
    const [products, forecasts] = await Promise.all([prisma.product.findMany(), prisma.forecast.findMany()]);
    const inventory = planInventory(products, forecasts);
    res.json(req.query.risk == null ? inventory : inventory.filter(p => p.stockoutRisk === (req.query.risk === 'true')));
  } catch (error) { next(error); }
});
app.get('/api/products/:id', async (req, res, next) => {
  try {
    if (!/^[1-9]\d*$/.test(req.params.id) || !Number.isSafeInteger(Number(req.params.id))) return res.status(400).json({ error: 'Producto inválido' });
    const id = Number(req.params.id);
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return res.status(404).json({ error: 'Producto inexistente' });
    const [forecasts, history] = await Promise.all([
      prisma.forecast.findMany({ where: { productId: id, date: { gte: new Date(new Date().toISOString().slice(0, 7) + '-01T00:00:00Z') } }, include: { customer: true }, orderBy: { date: 'asc' } }),
      prisma.$queryRaw`SELECT TO_CHAR(date, 'YYYY-MM') AS month, SUM(quantity)::float8 AS quantity FROM "Sale" WHERE "productId" = ${id} GROUP BY month ORDER BY month`,
    ]);
    res.json({ product, forecasts, history, inventory: planInventory([product], forecasts)[0] });
  } catch (error) { next(error); }
});
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: 'Error obteniendo datos' });
});

const PORT = process.env.PORT || 3001;
if (require.main === module) app.listen(PORT, () => console.log(`API corriendo en http://localhost:${PORT}`));
module.exports = { app, prisma };
