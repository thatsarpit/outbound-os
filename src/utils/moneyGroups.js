/** Aggregate stored minor units only within the same stored currency. No FX is inferred. */
export function currencyTotals(rows, amount = row => row.total) {
  const groups = new Map();
  for (const row of rows) {
    const currency = String(row.currency || 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
    groups.set(currency, (groups.get(currency) || 0) + (Number(amount(row)) || 0));
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([currency, total]) => ({ currency, total }));
}

/** A scalar remains usable only when there is one currency, or no money yet. */
export function singleCurrencyTotal(groups) {
  return groups.length > 1 ? null : groups[0]?.total || 0;
}

export function customerOrderValues(orders) {
  const lifetimeValueByCurrency = currencyTotals(orders);
  return {
    lifetimeValueByCurrency,
    lifetimeValue: singleCurrencyTotal(lifetimeValueByCurrency),
    lifetimeCurrency: lifetimeValueByCurrency.length === 1 ? lifetimeValueByCurrency[0].currency : null,
    totalOrders: orders.length,
    lastOrderAt: orders.reduce((latest, row) => !latest || new Date(row.createdAt) > new Date(latest) ? row.createdAt : latest, null),
  };
}

export function orderStatsValues(orders) {
  const confirmed = orders.filter(row => !['draft', 'cancelled'].includes(row.status));
  const revenueByCurrency = currencyTotals(confirmed);
  const statuses = [...new Set(orders.map(row => row.status))].sort();
  return {
    revenueByCurrency,
    totalRevenue: singleCurrencyTotal(revenueByCurrency),
    orderCount: confirmed.length,
    byStatus: statuses.map(status => {
      const rows = orders.filter(row => row.status === status);
      const totalsByCurrency = currencyTotals(rows);
      return { status, _count: { id: rows.length }, _sum: { total: singleCurrencyTotal(totalsByCurrency) }, totalsByCurrency };
    }),
  };
}

export function revenueCurrencySummaries(orders, invoices, monthKey) {
  const currencies = [...new Set([...orders, ...invoices].map(row => String(row.currency || 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN'))].sort();
  return currencies.map(currency => {
    const selectedOrders = orders.filter(row => String(row.currency || 'UNKNOWN').trim().toUpperCase() === currency);
    const selectedInvoices = invoices.filter(row => String(row.currency || 'UNKNOWN').trim().toUpperCase() === currency);
    const months = new Map();
    const countries = new Map();
    for (const order of selectedOrders) {
      const month = monthKey(order.createdAt);
      months.set(month, (months.get(month) || 0) + order.total);
      const country = order.country || 'Unknown';
      countries.set(country, (countries.get(country) || 0) + order.total);
    }
    return {
      currency,
      bookedTotal: selectedOrders.reduce((sum, row) => sum + row.total, 0),
      orderCount: selectedOrders.length,
      invoiced: selectedInvoices.reduce((sum, row) => sum + row.total, 0),
      collected: selectedInvoices.reduce((sum, row) => sum + row.amountPaid, 0),
      outstanding: selectedInvoices.reduce((sum, row) => sum + Math.max(0, row.total - row.amountPaid), 0),
      months: [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, total]) => ({ month, total })),
      byCountry: [...countries].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([country, total]) => ({ country, total })),
    };
  });
}

export function productCurrencyPerformance(lines, products) {
  const byId = new Map(products.map(product => [product.id, product]));
  const groups = new Map();
  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product) continue;
    const currency = String(line.order.currency || 'UNKNOWN').trim().toUpperCase();
    const key = JSON.stringify([line.productId, currency, line.unit]);
    const group = groups.get(key) || { product, currency, unit: line.unit, lineCount: 0, quantity: 0, revenue: 0, costInr: 0 };
    group.lineCount += 1;
    group.quantity += line.quantity;
    group.revenue += line.lineTotal;
    group.costInr += line.procurementTotal || 0;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.currency.localeCompare(b.currency) || b.revenue - a.revenue || a.product.id - b.product.id);
}
