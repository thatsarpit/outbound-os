import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createPrismaClient } from '../src/utils/createPrismaClient.js';
import { currencyTotals, singleCurrencyTotal } from '../src/utils/moneyGroups.js';

test('currency totals retain their units, including empty and unknown historical currency', () => {
  assert.deepEqual(currencyTotals([{ currency: 'GBP', total: 10000 }, { currency: 'USD', total: 10000 }]), [
    { currency: 'GBP', total: 10000 }, { currency: 'USD', total: 10000 },
  ]);
  assert.equal(singleCurrencyTotal(currencyTotals([{ currency: 'GBP', total: 10000 }, { currency: 'USD', total: 10000 }])), null);
  assert.equal(singleCurrencyTotal([]), 0);
  assert.deepEqual(currencyTotals([{ currency: '', total: 500 }]), [{ currency: 'UNKNOWN', total: 500 }]);
});

test('real financial routes reconcile mixed currencies against an isolated migrated SQLite ledger', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'outbound-money-'));
  const filename = path.join(directory, 'fixture.db');
  const sql = new DatabaseSync(filename);
  const migrations = new URL('../prisma/migrations/', import.meta.url);
  for (const name of readdirSync(migrations).sort()) {
    const migration = new URL(`${name}/migration.sql`, migrations);
    if (existsSync(migration)) sql.exec(readFileSync(migration, 'utf8'));
  }
  const db = createPrismaClient(`file:${filename}`);
  // Prisma's existing singleton seam keeps these real routers confined to this fixture.
  globalThis.prisma = db;
  process.env.DATABASE_URL = `file:${filename}`;
  process.env.JWT_SECRET = 'fixture-finance-secret-not-for-production';
  process.env.LEAD_SYNC_ENCRYPTION_KEY = 'fixture-finance-encryption-not-for-production';
  process.env.AUTH_PROVIDER = 'local';
  process.env.MCP_SERVICE_TOKEN = 'fixture-financial-reader-not-a-real-token';
  const [{ default: customers }, { default: sales }, { default: products }, { default: notifier }] = await Promise.all([
    import('../src/routes/customers.js'), import('../src/routes/sales.js'),
    import('../src/routes/products.js'), import('../src/services/orderNotifier.js'),
  ]);
  const routers = [customers, sales, products];
  // Exercise the registered route handlers and real Prisma queries without
  // opening a listening socket. Authentication is covered by the API suite.
  const get = async target => {
    const url = new URL(target, 'https://fixture.example.test');
    let chosen;
    let params;
    for (const router of routers) {
      for (const layer of router.stack) {
        if (!layer.route?.methods.get) continue;
        const keys = [];
        const pattern = layer.route.path.replace(/:([^/]+)/g, (_match, key) => { keys.push(key); return '([^/]+)'; });
        const match = url.pathname.match(new RegExp(`^${pattern}$`));
        if (match) { chosen = layer.route; params = Object.fromEntries(keys.map((key, i) => [key, match[i + 1]])); break; }
      }
      if (chosen) break;
    }
    assert.ok(chosen, `GET ${url.pathname} is registered`);
    const response = { code: 200, body: undefined, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await chosen.stack.at(-1).handle({ query: Object.fromEntries(url.searchParams), params }, response);
    assert.equal(response.code, 200, JSON.stringify(response.body));
    return response.body;
  };
  try {
    const customer = await db.customer.create({ data: { name: 'Fixture buyer', email: 'buyer@example.test', currency: 'USD' } });
    const product = await db.product.create({ data: { name: 'Fixture product', sellCurrency: 'EUR', defaultUnit: 'carton' } });
    const now = new Date();
    const old = new Date(Date.UTC(now.getUTCFullYear() - 5, 0, 1));
    const createOrder = (id, currency, total, createdAt = now, status = 'confirmed') => db.salesOrder.create({ data: {
      id, customerId: customer.id, orderNumber: `FIXTURE-${id}`, customerName: 'Fixture buyer', currency, total, status, createdAt,
    } });
    const gbp = await createOrder(1, 'GBP', 10000);
    const usd = await createOrder(2, 'USD', 10000);
    await createOrder(3, 'USD', 500000, old, 'draft');
    const oldOrder = await createOrder(4, 'USD', 3000, old);
    await db.salesOrderItem.createMany({ data: [
      { orderId: gbp.id, productId: product.id, productName: product.name, quantity: 1, unit: 'box', lineTotal: 10000 },
      { orderId: usd.id, productId: product.id, productName: product.name, quantity: 2, unit: 'strip', lineTotal: 10000 },
    ] });
    await db.salesInvoice.createMany({ data: [
      { orderId: gbp.id, number: 'FIXTURE-GBP', status: 'issued', currency: 'GBP', total: 10000, amountPaid: 0, createdAt: now },
      { orderId: usd.id, number: 'FIXTURE-USD', status: 'partially_paid', currency: 'USD', total: 10000, amountPaid: 2500, createdAt: now },
      { orderId: oldOrder.id, number: 'FIXTURE-OLD', status: 'issued', currency: 'USD', total: 3000, amountPaid: 500, createdAt: old },
    ] });

    const stats = await get('/orders/stats');
    assert.equal(stats.totalRevenue, null);
    assert.deepEqual(stats.revenueByCurrency, [{ currency: 'GBP', total: 10000 }, { currency: 'USD', total: 13000 }]);
    assert.equal(stats.orderCount, 3);
    assert.equal(stats.byStatus.find(row => row.status === 'confirmed')._sum.total, null);

    const revenue = await get('/revenue/summary?months=3&currency=GBP');
    assert.equal(revenue.bookedTotal, null);
    assert.equal(revenue.invoiced, null);
    assert.deepEqual(revenue.byCurrency.map(row => [row.currency, row.bookedTotal, row.invoiced, row.collected, row.outstanding]), [
      ['GBP', 10000, 10000, 0, 10000], ['USD', 10000, 13000, 3000, 10000],
    ]);
    assert.equal(revenue.period.orderDateBasis, 'createdAt');
    assert.equal(revenue.period.invoiceScope, 'lifetime');
    assert.equal(revenue.unpaidInvoiceCount, 1);
    assert.deepEqual(revenue.unpaidInvoices.map(row => row.currency), ['GBP']);

    const buyer = await get(`/customers/${customer.id}`);
    assert.equal(buyer.lifetimeValue, null);
    assert.deepEqual(buyer.lifetimeValueByCurrency, stats.revenueByCurrency);
    await notifier.refreshCustomerRollups(customer.id);
    const persisted = await db.customer.findUnique({ where: { id: customer.id } });
    assert.equal(persisted.lifetimeValue, 13000, 'legacy column contains only default-currency subtotal');
    const customerStats = await get('/customers/stats');
    assert.equal(customerStats.lifetimeValue, null);
    assert.equal(customerStats.topCustomers.length, 0, 'unlike currencies have no combined ranking');
    assert.deepEqual(customerStats.lifetimeValueByCurrency, stats.revenueByCurrency);

    await db.product.update({ where: { id: product.id }, data: { sellCurrency: 'AUD', defaultUnit: 'carton' } });
    const performance = await get('/products/performance');
    assert.deepEqual(performance.data.map(row => [row.currency, row.unit, row.revenue, row.quantity]), [
      ['GBP', 'box', 10000, 1], ['USD', 'strip', 10000, 2],
    ]);
    assert.equal(performance.data[0].product.sellCurrency, 'AUD', 'current catalogue default does not label historical value');
    const page = await get('/orders?limit=1&page=2');
    assert.equal(page.data.length, 1);
    assert.equal(page.total, 4);
    assert.equal(page.pages, 4);
    assert.equal((await get('/customers?limit=0&page=-1')).page, 1);
  } finally {
    await db.$disconnect();
    sql.close();
    delete globalThis.prisma;
    rmSync(directory, { recursive: true, force: true });
  }
});
