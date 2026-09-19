const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

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
    res.json({
      metrics: {
        customers, products: catalog.length,
        totalPredicted: forecasts.reduce((total, item) => total + item.prediction, 0),
        modelMAE: 4.33,
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

const PORT = process.env.PORT || 3001;
if (require.main === module) app.listen(PORT, () => console.log(`API corriendo en http://localhost:${PORT}`));
module.exports = { app, prisma };
