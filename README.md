# Demand Predictor — inventario y compras

Se conserva PostgreSQL, Express/Prisma, React/Vite, Python/LightGBM, Recharts y react-icons. La planificación es una función de negocio del backend; el modelo sólo predice cantidades.

## Estructura

- `backend/prisma`: esquema, migraciones y seed existente. `Product.leadTimeDays` tiene default 30 y restricción de no negatividad. La migración conserva los datos y asigna 15/20/30/45/60 días a los productos ficticios originales.
- `backend/src/services/inventory.js`: cálculo puro de planificación, utilizado por dashboard, inventario y detalle.
- `backend/src/server.js`: API existente extendida.
- `ml/data.py`: carga común y series mensuales, configuración desde `DATABASE_URL` o `backend/.env`.
- `ml/train.py`, `ml/predict.py`: entrenamiento y forecast recursivo con las mismas siete variables existentes.
- `frontend/src/components/InventoryPanel.jsx`: plan de compras y detalle del producto. Se conservan predicciones por cliente, tendencias, filtros y exportación CSV existentes.
- `backend/test`, `ml/test_forecast.py`, `frontend/src/decisions.test.js`: pruebas.

## Ejecutar

PostgreSQL debe estar iniciado en el Docker existente. Se reutiliza `backend/.env` con `DATABASE_URL`. No es necesario volver a cargar el seed.

Desde la raíz:

```sh
cd backend
npm install
npm run db:migrate
npm run db:generate
npm start
```

En otra terminal, desde la raíz, usando el entorno Python existente:

```sh
ml/venv/bin/python -m pip install -r ml/requirements.txt
ml/venv/bin/python ml/train.py
ml/venv/bin/python ml/predict.py --months 6
```

Si falta el entorno, crearlo primero con `python3 -m venv ml/venv`. `--months` acepta 3 a 6, por defecto 6. En todos los casos se agrega el mes actual para cubrir la planificación desde hoy.

En otra terminal:

```sh
cd frontend
npm install
npm run dev
```

Frontend: `http://localhost:5173`. API: `http://localhost:3001/api`; se puede cambiar con `VITE_API_URL` y `PORT`. Si los servidores ya estaban ejecutándose, reiniciar el backend para cargar el nuevo cliente Prisma y los endpoints. El seed (`cd backend && npm run db:seed`) es sólo para una base de demostración: elimina forecasts, ventas, clientes y productos antes de recrearlos. **No ejecutarlo para actualizar una base existente.**

## Cómo funciona

1. Se suman todas las ventas por cliente/producto/mes. Los meses internos sin ventas se completan con cero desde la primera venta hasta el último mes cerrado; no se entrena con el mes abierto.
2. Entrenamiento conserva las variables `customerId`, `productId`, `year`, `month`, `last_month`, `two_months_ago`, `avg_last_3`. Se evalúa cronológicamente y luego se ajusta el modelo final con todos los meses cerrados. `ml/model.pkl` y `ml/metrics.json` son archivos locales generados. El MAE mostrado corresponde a evaluación de un paso, no a precisión garantizada a seis meses.
3. Cada predicción se incorpora a la serie para construir los lags del siguiente mes. Hay una fila por cliente/producto/primer día del mes a medianoche UTC. Relaciones con menos de tres meses se completan con ceros para los lags; productos sin historia cerrada no reciben demanda inventada. Reentrenar una vez tras este cambio para alinear el modelo a la agregación mensual.
4. La actualización de Forecast es atómica: reemplaza el horizonte desde el mes actual en una transacción, conserva meses pasados y respeta la clave única. Repetir el comando no duplica filas. Acortar el horizonte elimina forecasts futuros sobrantes.
5. Planificación usa la fecha actual UTC y el stock actual. Demanda diaria = forecast mensual agregado de todos los clientes / días reales del mes. Sólo se consume la parte desde hoy; las ventas pasadas no se descuentan otra vez del stock actual.
6. Demanda durante lead time se acumula desde hoy hasta la llegada (fin exclusivo). Quiebre es el primer día cuya demanda supera el stock disponible. Fecha límite = quiebre − lead time. Si ya pasó, se recomienda pedir hoy y se avisa si la llegada sería tardía. Se supone recepción al inicio del día.
7. Compras mensuales: la primera ventana cubre desde hoy hasta el fin del próximo mes. Cantidad = `ceil(max(0, demanda de esa ventana − stock actual))`. Después se evalúa cada mes, descontando el stock y los lotes propuestos anteriores (incluidos sobrantes por redondeo). Se omiten meses que no necesitan compra. `suggestedQuantity` y `purchaseTargetMonth` identifican el primer lote necesario; `monthlyPurchases` contiene todos los lotes con sus propias fechas límite. Con lead times largos puede ser necesario pedir varios lotes hoy. Las compras anteriores se suponen recibidas a tiempo sólo para construir el escenario; no se registran como órdenes reales. Cada consulta recalcula desde el stock real y la fecha actual, por lo que las órdenes pendientes todavía deben verificarse manualmente.
8. Se conserva la proyección de varios meses: `projectedDemand`, `projectedStock` y `horizonShortage` (faltante acumulado sin nuevas compras). No confundir `horizonShortage` con la próxima compra. `nextMonthDemand` es demanda del próximo mes completo y `nextMonthShortage` incluye también el faltante restante del mes actual. Stock proyectado negativo representa demanda sin cubrir sin reposiciones.
9. `PEDIR`: fecha límite hoy o pasada. `VIGILAR`: quiebre futuro con fecha de pedido futura, o cobertura incompleta. `OK`: sin quiebre dentro del horizonte y cobertura suficiente para el lead time. Mes faltante no significa demanda cero; se informan nulos y cobertura incompleta. Una estimación cero explícita sí es válida.

La fecha de quiebre es aproximada: no modela variación diaria dentro del mes. Los pronósticos recursivos acumulan incertidumbre. Safety stock, lote mínimo, proveedor y órdenes pendientes se incorporarán como políticas/entradas en el servicio de inventario y relaciones Prisma; no se agregan tablas vacías ni decisiones de compra al modelo. Actualmente no se incluyen reservas, órdenes en tránsito ni stock de seguridad.

## API

- `GET /api/dashboard`: conserva `metrics`, `forecasts`, `catalog`, `history`; agrega `inventory`, `metrics.productsAtRisk` y `metrics.productsToOrderNow`. Forecasts desde el mes actual; demanda total de forecasts mensuales completos se distingue en UI de demanda restante desde hoy.
- `GET /api/forecasts?productId=1&customerId=1`: forecasts vigentes, filtros opcionales.
- `GET /api/inventory`: planificación para todo el catálogo.
- `GET /api/inventory?risk=true`: productos con quiebre detectado (sin endpoint redundante); `false` devuelve sólo riesgos descartados, no desconocidos.
- `GET /api/products/1`: producto, historia mensual agregada, forecasts por cliente y la misma planificación.
- `GET /api/health`: salud del proceso. Identificadores inválidos devuelven 400; producto inexistente, 404.

## Probar el flujo completo

1. Migrar, generar Prisma, entrenar y predecir con los comandos anteriores.
2. Abrir Resumen: verificar riesgo de stock, pedir ahora y demanda desde hoy. El plan de compras utiliza todo el horizonte, independientemente del filtro de períodos de predicciones.
3. En Stock y reposición, filtrar PEDIR/VIGILAR/OK y exportar compras. Para PEDIR, revisar cantidad, fecha límite, fecha recomendada y alerta de llegada tardía.
4. Seleccionar un producto: ver historial, forecast, stock proyectado, lead time y recomendación. «Ver predicciones por cliente» conserva el detalle existente.
5. Volver a ejecutar `predict.py`: siguen existiendo siete meses por relación (mes actual + seis futuros), sin duplicados.

```sh
cd backend
npm test
TEST_DATABASE=1 npm test
cd ..
ml/venv/bin/python -m unittest discover -s ml -p 'test_*.py'
cd frontend
npm test
npm run lint
npm run build
```

La prueba `TEST_DATABASE=1` requiere PostgreSQL local con seed y forecast generado con `--months 6`; es de lectura y compara los cuatro endpoints. Las pruebas unitarias cubren meses faltantes, años bisiestos, stock compartido, horizonte insuficiente, fecha límite, agotamiento exacto y recursión entre años.


Ejemplo con fecha 19/9/2026, Producto 1: stock 550, lead time 15 días; demanda restante de septiembre 377,2 + octubre 936 = 1.313,2. Próxima compra: **764 unidades**, a más tardar el **21/9**, para cubrir hasta fin de octubre. El faltante de **5.720 unidades hasta marzo** permanece como contexto, repartido en seis lotes mensuales. El plan no crea órdenes ni envía notificaciones: muestra alertas operativas y se actualiza con cada consulta al dashboard.

## Vista operativa

El resumen y la tabla de inventario muestran desde hoy hasta fin del próximo mes. Los estados de la pantalla y el filtro se refieren a esa ventana, manteniendo PEDIR para compras posteriores que por lead time ya deben hacerse. La proyección completa, el faltante acumulado y el calendario mensual están plegados en el detalle del producto. El análisis adicional del resumen también está plegado. El CSV operativo exporta los lotes hasta el próximo mes y los posteriores que deben pedirse ahora. La API conserva el horizonte completo.
