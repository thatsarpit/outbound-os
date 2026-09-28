import express from 'express';
import prisma from '../utils/prismaClient.js';
import { requireRole } from '../auth/index.js';
import { computeSettlement, suppliersForLeadTags } from '../services/settlement.js';

/**
 * Payment methods, suppliers, and the settlement view of an order.
 *
 * Rates live in the database rather than the code because they change and
 * differ per account. Fee rates are basis points (10% = 1000); FX is
 * 1/10,000 of a home-currency unit per unit of the order's currency
 * (83.4567 = 834567).
 *
 * "Home currency" is BUSINESS_CURRENCY: what suppliers are paid in and what
 * lands in the bank. The columns are named *Inr for historical reasons; they
 * hold home-currency minor units whatever that currency is.
 */

const homeCurrency = () => process.env.BUSINESS_CURRENCY || 'USD';

const router = express.Router();
const toInt = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : d;
};

// ── Payment methods ──────────────────────────────────────────────────────────

router.get('/payment-methods', requireRole('agent'), async (_req, res) => {
  try {
    res.json({
      data: await prisma.paymentMethod.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/payment-methods', requireRole('manager'), async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name?.trim()) return res.status(400).json({ error: 'name is required' });
    res.status(201).json(await prisma.paymentMethod.create({
      data: {
        tenantId: b.tenantId ?? 1,
        name: b.name.trim(),
        feeBps: toInt(b.feeBps, 0),
        feeFixed: toInt(b.feeFixed, 0),
        passOnByDefault: Boolean(b.passOnByDefault),
        enabled: b.enabled !== false,
        sortOrder: toInt(b.sortOrder, 0),
        notes: b.notes || null,
      },
    }));
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'A payment method with that name already exists' });
    res.status(500).json({ error: e.message });
  }
});

router.patch('/payment-methods/:id', requireRole('manager'), async (req, res) => {
  try {
    const b = req.body || {};
    const data = {};
    if (b.name !== undefined) data.name = String(b.name).trim();
    for (const f of ['feeBps', 'feeFixed', 'sortOrder']) if (b[f] !== undefined) data[f] = toInt(b[f], 0);
    if (b.passOnByDefault !== undefined) data.passOnByDefault = Boolean(b.passOnByDefault);
    if (b.enabled !== undefined) data.enabled = Boolean(b.enabled);
    if (b.notes !== undefined) data.notes = b.notes;
    res.json(await prisma.paymentMethod.update({ where: { id: toInt(req.params.id) }, data }));
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Payment method not found' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/payment-methods/:id', requireRole('manager'), async (req, res) => {
  try {
    // Disable rather than delete where orders reference it, so a settled
    // order keeps the method it was actually paid through.
    const id = toInt(req.params.id);
    const used = await prisma.salesOrder.count({ where: { paymentMethodId: id } });
    if (used > 0) {
      const row = await prisma.paymentMethod.update({ where: { id }, data: { enabled: false } });
      return res.json({ disabled: true, reason: `${used} order(s) reference this method`, data: row });
    }
    await prisma.paymentMethod.delete({ where: { id } });
    res.json({ success: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Payment method not found' });
    res.status(500).json({ error: e.message });
  }
});

// ── Suppliers ────────────────────────────────────────────────────────────────

router.get('/suppliers', requireRole('agent'), async (_req, res) => {
  try {
    const suppliers = await prisma.supplier.findMany({ orderBy: { name: 'asc' } });
    const counts = await prisma.salesOrder.groupBy({ by: ['supplierId'], _count: { id: true } });
    const map = Object.fromEntries(counts.map((c) => [c.supplierId, c._count.id]));
    res.json({ data: suppliers.map((s) => ({ ...s, orderCount: map[s.id] || 0 })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/suppliers', requireRole('manager'), async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name?.trim()) return res.status(400).json({ error: 'name is required' });
    res.status(201).json(await prisma.supplier.create({
      data: {
        tenantId: b.tenantId ?? 1,
        name: b.name.trim(),
        matchTag: b.matchTag?.trim() || null,
        contactName: b.contactName || null,
        contactEmail: b.contactEmail || null,
        contactPhone: b.contactPhone || null,
        currency: b.currency || homeCurrency(),
        enabled: b.enabled !== false,
        notes: b.notes || null,
      },
    }));
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'A supplier with that name already exists' });
    res.status(500).json({ error: e.message });
  }
});

router.patch('/suppliers/:id', requireRole('manager'), async (req, res) => {
  try {
    const b = req.body || {};
    const data = {};
    for (const f of ['name', 'matchTag', 'contactName', 'contactEmail', 'contactPhone', 'currency', 'notes']) {
      if (b[f] !== undefined) data[f] = b[f] === '' ? null : b[f];
    }
    if (b.enabled !== undefined) data.enabled = Boolean(b.enabled);
    res.json(await prisma.supplier.update({ where: { id: toInt(req.params.id) }, data }));
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Supplier not found' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/suppliers/:id', requireRole('manager'), async (req, res) => {
  try {
    const id = toInt(req.params.id);
    const used = await prisma.salesOrder.count({ where: { supplierId: id } });
    if (used > 0) {
      const row = await prisma.supplier.update({ where: { id }, data: { enabled: false } });
      return res.json({ disabled: true, reason: `${used} order(s) reference this supplier`, data: row });
    }
    await prisma.supplier.delete({ where: { id } });
    res.json({ success: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Supplier not found' });
    res.status(500).json({ error: e.message });
  }
});

// ── Settlement view of one order ─────────────────────────────────────────────

router.get('/orders/:id/settlement', requireRole('agent'), async (req, res) => {
  try {
    const order = await prisma.salesOrder.findUnique({
      where: { id: toInt(req.params.id) },
      include: { paymentMethod: true, supplier: true, items: true },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const result = computeSettlement({
      subtotal: order.subtotal,
      discountTotal: order.discountTotal,
      taxTotal: order.taxTotal,
      feeBps: order.paymentMethod?.feeBps ?? 0,
      feeFixed: order.paymentMethod?.feeFixed ?? 0,
      feeMode: order.feeMode,
      // An order already in the home currency converts 1:1 without anyone
      // having to type a rate.
      fxRateToInr: order.fxRateToInr ?? (order.currency === homeCurrency() ? 10000 : null),
      procurementCostInr: order.procurementCostInr,
      amountReceivedInr: order.amountReceivedInr,
    });
    res.json({
      ...result,
      currency: order.currency,
      homeCurrency: homeCurrency(),
      paymentMethod: order.paymentMethod,
      supplier: order.supplier,
      feeMode: order.feeMode,
      fxRateToInr: order.fxRateToInr,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Which supplier a lead's tags route to. Used to pre-select on order creation. */
router.get('/leads/:id/supplier', requireRole('agent'), async (req, res) => {
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: toInt(req.params.id) },
      select: { id: true, tags: true, source: true },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const suppliers = await prisma.supplier.findMany();
    // Fall back to source when no tag matches — imported leads carry their
    // origin there even when tags were never applied.
    let matches = suppliersForLeadTags(lead.tags, suppliers);
    if (!matches.length) matches = suppliersForLeadTags(lead.source, suppliers);
    res.json({
      supplier: matches[0] || null,
      matches,
      // Surfaced so the order form can say "this lead matches two suppliers"
      // rather than quietly choosing one.
      ambiguous: matches.length > 1,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
