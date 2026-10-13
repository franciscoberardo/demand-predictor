// Pure business rules. Future purchasing policies belong here, never in the ML.
const DAY = 86400000;
const iso = date => date.toISOString().slice(0, 10);
const month = date => date.toISOString().slice(0, 7);
const round = value => Math.round(value * 100) / 100;
function planInventory(products, forecasts, asOf = new Date()) {
  const today = new Date(`${iso(asOf)}T00:00:00Z`);
  const totals = new Map();
  for (const row of forecasts) {
    const key = `${row.productId}:${month(new Date(row.date))}`;
    totals.set(key, (totals.get(key) ?? 0) + Number(row.prediction));
  }
  return products.map(product => {
    const arrival = new Date(+today + product.leadTimeDays * DAY);
    const months = [...totals.keys()].filter(key => key.startsWith(`${product.id}:`)).map(key => key.split(':')[1]).filter(key => key >= month(today)).sort();
    const last = months.at(-1);
    const end = last ? new Date(`${last}-01T00:00:00Z`) : today;
    if (last) end.setUTCMonth(end.getUTCMonth() + 1);
    let demand = 0, leadDemand = 0, stockout = null, gap = false;
    const timeline = [];
    const nextMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
    const nextMonth = month(nextMonthStart);
    const monthlyPurchases = [];
    let plannedSupply = product.stock, bucketBreak = null;
    let nextMonthShortage = null;

    for (let day = new Date(today); day < end; day = new Date(+day + DAY)) {
      const key = month(day);
      const value = totals.get(`${product.id}:${key}`);
      if (value == null) { gap = true; break; }
      const days = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0)).getUTCDate();
      const daily = value / days;
      if (!stockout && daily > 0 && demand + daily > product.stock + 1e-9) stockout = iso(day);
      if (!bucketBreak && daily > 0 && demand + daily > plannedSupply + 1e-9) bucketBreak = iso(day);
      demand += daily;
      if (day < arrival) leadDemand += daily;
      const next = new Date(+day + DAY);
      if (month(next) !== key) {
        timeline.push({ month: key, demand: round(demand), projectedStock: round(product.stock - demand) });
        // First purchase covers the rest of this month and next month. Thereafter,
        // each monthly lot credits earlier proposed lots, avoiding double counting.
        if (key >= nextMonth) {
          const quantity = Math.max(0, Math.ceil(demand - plannedSupply - 1e-9));
          if (key === nextMonth) nextMonthShortage = quantity;
          if (quantity > 0) {
            const orderDeadline = iso(new Date(+new Date(`${bucketBreak}T00:00:00Z`) - product.leadTimeDays * DAY));
            const recommendedOrderDate = orderDeadline < iso(today) ? iso(today) : orderDeadline;
            monthlyPurchases.push({
              targetMonth: key, quantity, estimatedStockoutDate: bucketBreak,
              orderDeadline, recommendedOrderDate,
              orderNow: orderDeadline <= iso(today),
              expectedArrivalDate: iso(new Date(+new Date(`${recommendedOrderDate}T00:00:00Z`) + product.leadTimeDays * DAY)),
              shortageBeforeArrival: bucketBreak < iso(arrival),
            });
            plannedSupply += quantity;
          }
          bucketBreak = null;
        }
      }
    }
    const complete = !!last && !gap && end >= arrival && nextMonthShortage != null;
    const deadline = stockout ? iso(new Date(+new Date(`${stockout}T00:00:00Z`) - product.leadTimeDays * DAY)) : null;
    const orderNow = deadline != null && deadline <= iso(today);
    return {
      productId: product.id, name: product.name, stock: product.stock, leadTimeDays: product.leadTimeDays,
      asOf: iso(today), horizonEnd: last ? iso(end) : null, coverageComplete: complete,
      projectedDemand: gap || !last ? null : round(demand),
      demandDuringLeadTime: complete ? round(leadDemand) : null,
      projectedStock: gap || !last ? null : round(product.stock - demand),
      stockoutRisk: stockout ? true : complete ? false : null, estimatedStockoutDate: stockout,
      orderRequired: stockout ? true : complete ? false : null, orderNow,
      orderDeadline: deadline, recommendedOrderDate: deadline ? (orderNow ? iso(today) : deadline) : null,
      expectedArrivalDate: iso(arrival), shortageBeforeArrival: stockout ? stockout < iso(arrival) : false,
      horizonShortage: gap || !last ? null : Math.max(0, Math.ceil(demand - product.stock - 1e-9)),
      nextMonth, nextMonthDemand: totals.get(`${product.id}:${nextMonth}`) ?? null,
      nextMonthShortage,
      purchaseTargetMonth: monthlyPurchases[0]?.targetMonth ?? null,
      suggestedQuantity: monthlyPurchases[0]?.quantity ?? (complete ? 0 : null),
      monthlyPurchases,
      status: orderNow ? 'PEDIR' : stockout || !complete ? 'VIGILAR' : 'OK', timeline,
    };
  }).sort((a, b) => Number(b.orderNow) - Number(a.orderNow) || (a.estimatedStockoutDate ?? '9999').localeCompare(b.estimatedStockoutDate ?? '9999'));
}
module.exports = { planInventory };
