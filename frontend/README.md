# Demand AI

Dashboard de demanda en React, Vite y Tailwind CSS.

## Desarrollo

- `npm install`
- Iniciar la API desde `../backend` con `node src/server.js` (requiere la base PostgreSQL configurada en su `.env`).
- `npm run dev`
- API por defecto: `http://localhost:3001/api`. Se puede configurar con `VITE_API_URL`.
- Validación: `npm test`, `npm run lint`, `npm run build`.

## Decisiones

- **Detalle cliente + producto:** abrir una fila de predicciones. Incluye seis meses históricos, pronóstico, promedio de tres meses cerrados, variaciones y stock compartido.
- **Stock y reposición:** usa la planificación del backend con lead time y todo el horizonte desde hoy. Estados PEDIR/VIGILAR/OK, fechas de pedido y quiebre, cantidad sugerida, exportación y detalle de producto con Recharts. Ver las reglas y comandos en el README de la raíz.
- **Tendencias:** compara la predicción contra el último mes cerrado anterior al pronóstico, según la fecha de la API. Excluye el primer mes del historial por posible cobertura parcial. El promedio exige tres meses disponibles; una base cero no genera porcentajes infinitos.
- **Alertas:** faltante mayor a cero, clientes con variación menor a -20% y productos con variación mayor a +15%. Las alertas de tendencia abren su lista filtrada; el faltante mensual abre el plan de compras completo. Se recalculan al recibir datos; la página consulta cada cinco minutos mientras está visible y al recuperar el foco.
- Si Resumen muestra todos los períodos, las alertas usan el primer mes previsto igual o posterior al mes actual (o el último disponible). El mes se indica junto al radar. Tendencias muestra un mes específico; el plan de stock usa todo el horizonte desde hoy.
- Los meses anteriores al primer registro de una relación o posteriores al último mes global disponible se consideran desconocidos. La ausencia de ventas dentro de la cobertura registrada se interpreta como cero.

## API

`GET /api/dashboard` mantiene `metrics` y `forecasts`, y agrega:

- `catalog`: productos con su stock actual, incluidos los que no tienen pronóstico.
- `history.monthly`: ventas agregadas por `customerId`, `productId`, `month` (`YYYY-MM`) y `quantity`.
- `history.firstMonth`, `history.currentMonth`, `history.asOf`: cobertura y fecha de consulta (UTC).

La API agrega las ventas en PostgreSQL. El frontend construye índices mensuales para las comparaciones. Si un servidor anterior no entrega historial, muestra «Sin base histórica». Los datos ilustrativos solo aparecen al activar explícitamente la demo tras un error de conexión.

El dashboard agrega `inventory` calculado en el backend. La demo histórica mantiene su vista ilustrativa y muestra que no hay planificación con lead time disponible; nunca inventa recomendaciones operativas.
