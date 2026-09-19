import { FiBookOpen, FiChevronDown, FiInfo } from 'react-icons/fi'

const meanings = [
  ['Demanda prevista', 'Cuántas unidades se estima que comprarán los clientes en el período indicado. Es una proyección, no un pedido confirmado.', 'Usala para planificar compras y contrastala con el stock.'],
  ['% del volumen', 'Qué parte de todas las unidades previstas del período representa esta fila. Por ejemplo, 10% significa 10 de cada 100 unidades; no es un porcentaje de crecimiento.', 'Te ayuda a identificar qué clientes o productos tienen más peso. La búsqueda no cambia el total de referencia.'],
  ['Tendencia', 'Cuánto sube o baja la predicción respecto a las ventas del mes cerrado que aparece debajo. +20% significa que se espera vender un 20% más que en ese mes.', 'Si sube, revisá el abastecimiento. Si baja, validá la próxima compra con el cliente antes de aumentar inventario.'],
  ['Cobertura de stock', 'Stock actual dividido por demanda prevista. 100% alcanza justo; 80% cubre 8 de cada 10 unidades esperadas.', 'Por debajo de 100%, revisá una reposición. El stock se comparte entre todos los clientes.'],
  ['Faltante · Ajustado · Correcto', 'Faltante: el stock no alcanza. Ajustado: alcanza, pero el margen extra es de hasta 15%. Correcto: el margen supera 15%, o no hay demanda prevista.', 'Ajustado no significa que no se pueda comprar: significa que hay poco margen si las ventas superan lo esperado.'],
  ['A reponer', 'Las unidades que faltan para cubrir la predicción: demanda menos stock, con un mínimo de cero.', 'Antes de comprar, comprobá reservas, pedidos en camino y plazos del proveedor; estos datos no están incorporados.'],
  ['Promedio y variación vs. promedio', 'El promedio usa los tres meses cerrados indicados en el detalle. Su variación compara la predicción con ese promedio, por eso puede diferir de la tendencia mensual.', 'Usalo para dar contexto y evitar decidir por un único mes atípico.'],
  ['Error histórico · MAE', 'La diferencia absoluta promedio entre predicciones y ventas reales durante la evaluación del modelo, expresada en unidades.', 'Un MAE de 4,33 no es 4,33% ni garantiza un margen de ±4,33 para cada predicción.'],
]

export default function MetricGuide() {
  return <details className="panel mb-6 group"><summary className="flex cursor-pointer list-none items-center gap-3 p-4 sm:px-5"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-ink"><FiBookOpen size={18} /></span><div className="flex-1"><h2 className="text-sm font-semibold">Entendé tus números</h2><p className="mt-1 text-xs text-muted">Qué significa cada dato y cómo usarlo para decidir.</p></div><FiChevronDown className="text-muted transition-transform group-open:rotate-180" /></summary><div className="grid gap-5 border-t border-line-soft p-5 sm:grid-cols-2">{meanings.map(([name, description, action]) => <article key={name} className="rounded-xl bg-surface-soft p-4"><h3 className="flex items-center gap-2 text-xs font-semibold"><FiInfo className="shrink-0 text-accent-ink" />{name}</h3><p className="mt-2 text-xs leading-6 text-secondary">{description}</p><p className="mt-3 text-xs leading-6 text-accent-ink"><strong>Para decidir: </strong>{action}</p></article>)}</div></details>
}

export function QuickHelp({ label, children }) {
  return <details className="mt-3 rounded-lg bg-surface-soft px-3 py-2 text-left"><summary className="cursor-pointer text-[11px] font-medium text-accent-ink">¿Cómo leer {label}?</summary><p className="mt-2 max-w-2xl text-xs font-normal normal-case leading-6 tracking-normal text-secondary">{children}</p></details>
}
