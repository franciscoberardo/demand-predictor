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
- **Stock y reposición:** compara un único mes de demanda, sumando todos los clientes, con el stock actual. Reposición = `max(0, ceil(demanda - stock))`. Estado Ajustado cuando el stock cubre la demanda con hasta 15% de margen. No descuenta reservas ni considera compras pendientes.
- **Tendencias:** compara la predicción contra el último mes cerrado anterior al pronóstico, según la fecha de la API. Excluye el primer mes del historial por posible cobertura parcial. El promedio exige tres meses disponibles; una base cero no genera porcentajes infinitos.
- **Alertas:** faltante mayor a cero, clientes con variación menor a -20% y productos con variación mayor a +15%. Cada alerta abre su lista filtrada. Se recalculan al recibir datos; la página consulta cada cinco minutos mientras está visible y al recuperar el foco.
- Si Resumen muestra todos los períodos, las alertas usan el primer mes previsto igual o posterior al mes actual (o el último disponible). El mes se indica junto al radar. Stock y Tendencias siempre muestran un mes específico.
- Los meses anteriores al primer registro de una relación o posteriores al último mes global disponible se consideran desconocidos. La ausencia de ventas dentro de la cobertura registrada se interpreta como cero.

## API

`GET /api/dashboard` mantiene `metrics` y `forecasts`, y agrega:

- `catalog`: productos con su stock actual, incluidos los que no tienen pronóstico.
- `history.monthly`: ventas agregadas por `customerId`, `productId`, `month` (`YYYY-MM`) y `quantity`.
- `history.firstMonth`, `history.currentMonth`, `history.asOf`: cobertura y fecha de consulta (UTC).

La API agrega las ventas en PostgreSQL. El frontend construye índices mensuales para las comparaciones. Si un servidor anterior no entrega historial, muestra «Sin base histórica». Los datos ilustrativos solo aparecen al activar explícitamente la demo tras un error de conexión.
