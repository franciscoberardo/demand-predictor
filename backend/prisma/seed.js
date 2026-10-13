require('dotenv').config({ path: require('node:path').join(__dirname, '../.env'), quiet: true });
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  // Limpiar datos anteriores
  await prisma.forecast.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.product.deleteMany();

  // CLIENTES
  const customers = [];

  for (let i = 1; i <= 20; i++) {
    const customer = await prisma.customer.create({
      data: {
        name: `Cliente ${i}`,
        zone: ["Santa Fe", "Rosario", "Paraná", "Rafaela"][i % 4],
      },
    });

    customers.push(customer);
  }

  // PRODUCTOS
  const products = [];

  for (let i = 1; i <= 15; i++) {
    const product = await prisma.product.create({
      data: {
        name: `Producto ${i}`,
        category: ["Rodamientos", "Correas", "Lubricantes"][i % 3],
        price: 10000 + i * 1500,
        // Foto ficticia del stock físico actual, independiente del historial generado.
        stock: 500 + i * 50,
        leadTimeDays: [15, 20, 30, 45, 60][(i - 1) % 5],
      },
    });

    products.push(product);
  }

  // VENTAS - últimos 2 años
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 2);

  for (const customer of customers) {
    for (const product of products) {

      // Cada cliente tiene diferente nivel de consumo
      const customerFactor = 0.5 + Math.random() * 1.5;

      // Cada combinación cliente/producto tiene demanda base
      const baseDemand =
        (10 + Math.random() * 40) * customerFactor;

      const currentDate = new Date(startDate);

      while (currentDate <= new Date()) {

        const month = currentDate.getMonth();

        // Mayor demanda en ciertos meses
        let seasonFactor = 1;

        if (month === 10 || month === 11) {
          seasonFactor = 1.4;
        }

        if (month === 0 || month === 1) {
          seasonFactor = 0.8;
        }

        // Variación aleatoria
        const noise = 0.8 + Math.random() * 0.4;

        const quantity = Math.max(
          1,
          Math.round(baseDemand * seasonFactor * noise)
        );

        await prisma.sale.create({
          data: {
            customerId: customer.id,
            productId: product.id,
            date: new Date(currentDate),
            quantity,
            unitPrice: product.price,
          },
        });

        // Una compra por mes
        currentDate.setMonth(currentDate.getMonth() + 1);
      }
    }
  }

  console.log("✅ Datos ficticios generados");
}

main()
  .catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => {
    await prisma.$disconnect();
  });