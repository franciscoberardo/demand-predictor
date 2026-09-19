// Datos ilustrativos. Se muestran únicamente al activar explícitamente la demo.
const customers = ['Distribuidora Norte', 'Mercado Central', 'Almacén del Sur', 'Comercial Belgrano', 'Supermercado del Sol', 'Grupo Patagonia', 'Mayorista Córdoba', 'La Despensa']
const products = ['Café de especialidad', 'Aceite de oliva', 'Arroz integral', 'Yerba mate', 'Harina de trigo', 'Leche entera', 'Azúcar orgánica', 'Fideos secos']
const forecasts = customers.flatMap((name, customer) => products.map((product, index) => ({
  id: `demo-${customer}-${index}`,
  customerId: customer + 1,
  productId: index + 1,
  customer: { name },
  product: { name: product, stock: [4200, 4700, 5100, 3000, 4800, 2600, 2200, 1900][index] },
  date: '2026-10-01T12:00:00.000Z',
  prediction: Math.round((980 - index * 98) * (1 - customer * 0.075)),
})))
export const demoData = {
  metrics: { customers: customers.length, products: products.length, totalPredicted: forecasts.reduce((sum, item) => sum + item.prediction, 0), modelMAE: 4.33 },
  forecasts,
  catalog: products.map((name, index) => ({ id: index + 1, name, stock: [4200, 4700, 5100, 3000, 4800, 2600, 2200, 1900][index] })),
  history: {
    firstMonth: '2026-03',
    currentMonth: '2026-10',
    asOf: '2026-10-01T00:00:00Z',
    monthly: forecasts.flatMap((row) => ['03', '04', '05', '06', '07', '08', '09'].map((month, index) => ({
      month: `2026-${month}`, customerId: row.customerId, productId: row.productId,
      quantity: Math.round(row.prediction * (row.customerId < 3 ? 1.5 : row.productId < 4 ? 0.7 : 0.95) * (0.85 + index * 0.025)),
    }))),
  },
}
