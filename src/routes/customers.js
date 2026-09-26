import express from 'express';
import prisma from '../utils/prismaClient.js';
import { requireRole } from '../auth/index.js';
import orderNotifier from '../services/orderNotifier.js';

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
    const allowed = ['lastOrderAt', 'lifetimeValue', 'totalOrders', 'name', 'createdAt'];
    const take = Math.min(100, toInt(limit, 25));
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
    res.json({ data: customers, total, page: toInt(page, 1), pages: Math.ceil(total / take) || 1 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/customers/stats', requireRole('agent'), async (_req, res) => {
  try {
    const [totals, top] = await Promise.all([
      prisma.customer.aggregate({ _count: { id: true }, _sum: { lifetimeValue: true } }),
      prisma.customer.findMany({
        where: { totalOrders: { gt: 0 } },
        orderBy: { lifetimeValue: 'desc' },
        take: 5,
        select: { id: true, name: true, company: true, lifetimeValue: true, totalOrders: true, currency: true },
      }),
    ]);
    const repeat = await prisma.customer.count({ where: { totalOrders: { gt: 1 } } });
    res.json({
      customerCount: totals._count.id || 0,
      lifetimeValue: totals._sum.lifetimeValue || 0,
      repeatCustomers: repeat,
      topCustomers: top,
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
    res.json(customer);
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
    res.json(customer);
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
    if (existing) return res.json(existing);

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
    const since = new Date();
    since.setMonth(since.getMonth() - months);
    since.setHours(0, 0, 0, 0);

    const orders = await prisma.salesOrder.findMany({
      where: { status: { notIn: ['draft', 'cancelled'] }, createdAt: { gte: since } },
      select: { createdAt: true, total: true, currency: true, country: true, customerId: true },
    });

    // Grouped in JS rather than SQL so this stays portable to Postgres — the
    // volume here is orders, not messages, so it is not a scale concern.
    const byMonth = new Map();
    const byCountry = new Map();
    for (const o of orders) {
      const key = `${o.createdAt.getFullYear()}-${String(o.createdAt.getMonth() + 1).padStart(2, '0')}`;
      byMonth.set(key, (byMonth.get(key) || 0) + (o.total || 0));
      const c = o.country || 'Unknown';
      byCountry.set(c, (byCountry.get(c) || 0) + (o.total || 0));
    }

    const [invoiceAgg, unpaid] = await Promise.all([
      prisma.salesInvoice.aggregate({
        where: { status: { in: ['issued', 'partially_paid', 'paid'] } },
        _sum: { total: true, amountPaid: true },
      }),
      prisma.salesInvoice.findMany({
        where: { status: { in: ['issued', 'partially_paid'] } },
        select: { id: true, number: true, total: true, amountPaid: true, dueAt: true, currency: true,
          order: { select: { id: true, orderNumber: true, customerName: true } } },
        orderBy: { dueAt: 'asc' },
        take: 25,
      }),
    ]);

    const invoiced = invoiceAgg._sum.total || 0;
    const collected = invoiceAgg._sum.amountPaid || 0;

    res.json({
      months: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, total]) => ({ month, total })),
      byCountry: [...byCountry.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([country, total]) => ({ country, total })),
      bookedTotal: orders.reduce((s, o) => s + (o.total || 0), 0),
      orderCount: orders.length,
      invoiced,
      collected,
      outstanding: Math.max(0, invoiced - collected),
      unpaidInvoices: unpaid,
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
