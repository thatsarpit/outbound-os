import express from 'express';
import prisma from '../utils/prismaClient.js';
import { requireRole } from '../auth/index.js';
import orderNotifier from '../services/orderNotifier.js';
import { currencyTotals, customerOrderValues, revenueCurrencySummaries, singleCurrencyTotal } from '../utils/moneyGroups.js';
import { workspaceTimezone, zonedParts, zonedTimeToUtc } from '../utils/workspaceTime.js';

/**
 * Customers and revenue.
 *
 * A Customer is a buying relationship; a Lead is someone we are still trying
 * to reach. The rollups on Customer are denormalised and recomputed from
 * orders — never written directly from a request body.
 */

const router = express.Router();

const toInt = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : d;
};

/** Read full monetary history in its stored currencies, not a mutable preference. */
async function withCustomerValues(customers) {
  if (!customers.length) return [];
  const orders = await prisma.salesOrder.findMany({
    where: { customerId: { in: customers.map(row => row.id) }, status: { notIn: ['draft', 'cancelled'] } },
    select: { customerId: true, total: true, currency: true, createdAt: true },
  });
  return customers.map(customer => ({ ...customer, ...customerOrderValues(orders.filter(order => order.customerId === customer.id)) }));
}

// ── Customers ────────────────────────────────────────────────────────────────

router.get('/customers', requireRole('agent'), async (req, res) => {
  try {
    const { search, status, sortBy = 'lastOrderAt', sortOrder = 'desc', page = 1, limit = 25 } = req.query;
    const and = [];
    if (status && status !== 'all') and.push({ status });
    if (search) {
      and.push({
        OR: [
          { name: { contains: search } },
          { company: { contains: search } },
          { email: { contains: search } },
          { phone: { contains: search } },
        ],
      });
    }
    const where = and.length ? { AND: and } : {};
    if (sortBy === 'lifetimeValue') return res.status(400).json({ error: 'Customer values are reported by currency. Sort by last order, order count or name instead.' });
    const allowed = ['lastOrderAt', 'totalOrders', 'name', 'createdAt'];
    const take = Math.max(1, Math.min(100, toInt(limit, 25)));
    const skip = (Math.max(1, toInt(page, 1)) - 1) * take;

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { [allowed.includes(sortBy) ? sortBy : 'lastOrderAt']: sortOrder === 'asc' ? 'asc' : 'desc' },
        skip,
        take,
      }),
      prisma.customer.count({ where }),
    ]);
    res.json({ data: await withCustomerValues(customers), total, page: Math.max(1, toInt(page, 1)), pages: Math.ceil(total / take) || 1 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/customers/stats', requireRole('agent'), async (_req, res) => {
  try {
    const [customers, orders] = await Promise.all([
      prisma.customer.findMany({ select: { id: true, name: true, company: true, currency: true } }),
      prisma.salesOrder.findMany({
        where: { customerId: { not: null }, status: { notIn: ['draft', 'cancelled'] } },
        select: { customerId: true, total: true, currency: true, createdAt: true },
      }),
    ]);
    const lifetimeValueByCurrency = currencyTotals(orders);
    const customerValues = customers.map(customer => ({ ...customer, ...customerOrderValues(orders.filter(order => order.customerId === customer.id)) }));
    const topCustomersByCurrency = lifetimeValueByCurrency.map(({ currency }) => ({
      currency,
      customers: customerValues.map(customer => ({
        id: customer.id, name: customer.name, company: customer.company,
        currency, totalOrders: customer.totalOrders,
        lifetimeValue: customer.lifetimeValueByCurrency.find(row => row.currency === currency)?.total || 0,
      })).filter(customer => customer.lifetimeValue > 0).sort((a, b) => b.lifetimeValue - a.lifetimeValue).slice(0, 5),
    }));
    res.json({
      customerCount: customers.length,
      lifetimeValue: singleCurrencyTotal(lifetimeValueByCurrency),
      lifetimeValueByCurrency,
      repeatCustomers: customerValues.filter(customer => customer.totalOrders > 1).length,
      topCustomers: topCustomersByCurrency.length === 1 ? topCustomersByCurrency[0].customers : [],
      topCustomersByCurrency,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/customers/:id', requireRole('agent'), async (req, res) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: toInt(req.params.id) },
      include: {
        orders: {
          orderBy: { createdAt: 'desc' },
          include: {
            items: { orderBy: { sortOrder: 'asc' } },
            invoices: { select: { id: true, number: true, status: true, total: true } },
            shipments: { select: { id: true, status: true, carrier: true, trackingNumber: true, trackingUrl: true } },
          },
        },
        notifications: { orderBy: { createdAt: 'desc' }, take: 20 },
        lead: { select: { id: true, name: true, source: true } },
      },
    });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json((await withCustomerValues([customer]))[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/customers', requireRole('agent'), async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name?.trim()) return res.status(400).json({ error: 'name is required' });
    const customer = await prisma.customer.create({
      data: {
        tenantId: b.tenantId ?? 1,
        leadId: b.leadId ? toInt(b.leadId) : null,
        name: b.name.trim(),
        company: b.company || null,
        email: b.email || null,
        phone: b.phone || null,
        country: b.country || null,
        billingAddress: b.billingAddress || null,
        shippingAddress: b.shippingAddress || null,
        gstin: b.gstin || null,
        taxId: b.taxId || null,
        currency: b.currency || 'USD',
        notifyChannel: ['email', 'whatsapp', 'both', 'none'].includes(b.notifyChannel) ? b.notifyChannel : 'both',
        notes: b.notes || null,
        tags: b.tags || null,
      },
    });
    res.status(201).json(customer);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'That lead already has a customer record' });
    res.status(500).json({ error: e.message });
  }
});

router.patch('/customers/:id', requireRole('agent'), async (req, res) => {
  try {
    const b = req.body || {};
    const data = {};
    for (const f of ['name', 'company', 'email', 'phone', 'country', 'billingAddress',
      'shippingAddress', 'gstin', 'taxId', 'currency', 'notes', 'tags', 'status']) {
      if (b[f] !== undefined) data[f] = b[f];
    }
    if (b.notifyChannel && ['email', 'whatsapp', 'both', 'none'].includes(b.notifyChannel)) {
      data.notifyChannel = b.notifyChannel;
    }
    // Rollups are derived; refuse to let a request body set them.
    const customer = await prisma.customer.update({ where: { id: toInt(req.params.id) }, data });
    res.json((await withCustomerValues([customer]))[0]);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Customer not found' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/customers/:id', requireRole('manager'), async (req, res) => {
  try {
    await prisma.customer.delete({ where: { id: toInt(req.params.id) } });
    res.json({ success: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Customer not found' });
    res.status(500).json({ error: e.message });
  }
});

/** Promote a lead into a customer, carrying its contact details across. */
router.post('/leads/:id/convert', requireRole('agent'), async (req, res) => {
  try {
    const leadId = toInt(req.params.id);
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const existing = await prisma.customer.findUnique({ where: { leadId } });
    if (existing) return res.json((await withCustomerValues([existing]))[0]);

    const customer = await prisma.customer.create({
      data: {
        tenantId: lead.tenantId,
        leadId,
        name: lead.name,
        company: lead.company,
        email: lead.email,
        phone: lead.mobile,
        country: lead.country,
        currency: req.body?.currency || 'USD',
      },
    });
    await prisma.lead.update({ where: { id: leadId }, data: { status: 'closed', convertedAt: new Date() } })
      .catch(() => {});
    res.status(201).json(customer);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Revenue ──────────────────────────────────────────────────────────────────

router.get('/revenue/summary', requireRole('agent'), async (req, res) => {
  try {
    const months = Math.min(24, Math.max(1, toInt(req.query.months, 12)));
    const timezone = workspaceTimezone();
    const today = zonedParts(new Date(), timezone);
    const since = zonedTimeToUtc(today.year, today.month - months, today.day, 0, 0, timezone);
    const invoicePage = Math.max(1, toInt(req.query.invoicePage, 1));
    const currencyFilter = String(req.query.currency || '').trim().toUpperCase();
    if (currencyFilter && !/^[A-Z]{3,10}$/.test(currencyFilter)) return res.status(400).json({ error: 'Choose a valid currency.' });
    const unpaidWhere = { status: { in: ['issued', 'partially_paid'] }, ...(currencyFilter ? { currency: currencyFilter } : {}) };
    const [orders, invoices, unpaid, unpaidInvoiceCount] = await Promise.all([
      prisma.salesOrder.findMany({
        where: { status: { notIn: ['draft', 'cancelled'] }, createdAt: { gte: since } },
        select: { createdAt: true, total: true, currency: true, country: true },
      }),
      prisma.salesInvoice.findMany({
        where: { status: { in: ['issued', 'partially_paid', 'paid'] } },
        select: { total: true, amountPaid: true, currency: true },
      }),
      prisma.salesInvoice.findMany({
        where: unpaidWhere,
        select: { id: true, number: true, total: true, amountPaid: true, dueAt: true, currency: true,
          order: { select: { id: true, orderNumber: true, customerName: true } } },
        orderBy: [{ dueAt: 'asc' }, { id: 'asc' }], take: 25, skip: (invoicePage - 1) * 25,
      }),
      prisma.salesInvoice.count({ where: unpaidWhere }),
    ]);
    const byCurrency = revenueCurrencySummaries(orders, invoices, date => {
      const part = zonedParts(new Date(date), timezone);
      return `${part.year}-${String(part.month + 1).padStart(2, '0')}`;
    });
    const single = byCurrency.length === 1 ? byCurrency[0] : null;
    res.json({
      byCurrency,
      currency: single?.currency || null,
      months: single?.months || [], byCountry: single?.byCountry || [],
      bookedTotal: byCurrency.length > 1 ? null : single?.bookedTotal || 0,
      orderCount: orders.length,
      invoiced: byCurrency.length > 1 ? null : single?.invoiced || 0,
      collected: byCurrency.length > 1 ? null : single?.collected || 0,
      outstanding: byCurrency.length > 1 ? null : single?.outstanding || 0,
      period: { since: since.toISOString(), timezone, orderDateBasis: 'createdAt', invoiceScope: 'lifetime' },
      unpaidInvoices: unpaid, unpaidInvoiceCount, invoicePage, invoicePages: Math.ceil(unpaidInvoiceCount / 25) || 1,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Notifications ────────────────────────────────────────────────────────────

router.post('/orders/:id/notify', requireRole('agent'), async (req, res) => {
  try {
    const { event = 'order_confirmed', force = false, ...ctx } = req.body || {};
    // Reject unknown events here rather than letting notify() throw a 500 —
    // a typo in an event name should read as a bad request, not a server fault.
    if (!orderNotifier.EVENT_NAMES.includes(event)) {
      return res.status(400).json({ error: `event must be one of: ${orderNotifier.EVENT_NAMES.join(', ')}` });
    }
    const result = await orderNotifier.notify(toInt(req.params.id), event, ctx, { force: Boolean(force) });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/orders/:id/notifications', requireRole('agent'), async (req, res) => {
  try {
    const notifications = await prisma.orderNotification.findMany({
      where: { orderId: toInt(req.params.id) },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: notifications });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
