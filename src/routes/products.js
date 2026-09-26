import express from 'express';
import prisma from '../utils/prismaClient.js';
import { requireRole } from '../auth/index.js';

/**
 * The product catalogue.
 *
 * Prices held here are defaults that pre-fill an order line, never
 * constraints — both the sell price and the supplier's cost move deal to
 * deal, which is why a line keeps its own copy once written.
 */

const router = express.Router();
const toInt = (v, d = null) => {
  if (v === '' || v === null || v === undefined) return d;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : d;
};

router.get('/products', requireRole('agent'), async (req, res) => {
  try {
    const { search, active, supplierId, sortBy = 'name', sortOrder = 'asc' } = req.query;
    const and = [];
    if (active === 'true') and.push({ active: true });
    if (active === 'false') and.push({ active: false });
    if (supplierId) and.push({ supplierId: toInt(supplierId) });
    if (search) {
      and.push({
        OR: [
          { name: { contains: search } },
          { strength: { contains: search } },
          { sku: { contains: search } },
        ],
      });
    }
    const allowed = ['name', 'createdAt', 'sellPrice', 'costInr'];
    const products = await prisma.product.findMany({
      where: and.length ? { AND: and } : {},
      orderBy: { [allowed.includes(sortBy) ? sortBy : 'name']: sortOrder === 'desc' ? 'desc' : 'asc' },
      include: { supplier: { select: { id: true, name: true } } },
      take: 500,
    });
    res.json({ data: products, total: products.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * What actually sells.
 *
 * Impossible while lines were free text: "Hex Bolt" and "Hex Bolt M8" were
 * different strings and could never be added together.
 * Only counts lines linked to a catalogue entry, and says how many are not.
 */
router.get('/products/performance', requireRole('agent'), async (_req, res) => {
  try {
    const grouped = await prisma.salesOrderItem.groupBy({
      by: ['productId'],
      where: { productId: { not: null }, order: { status: { notIn: ['draft', 'cancelled'] } } },
      _sum: { quantity: true, lineTotal: true, procurementTotal: true },
      _count: { id: true },
    });
    const products = await prisma.product.findMany({
      where: { id: { in: grouped.map((g) => g.productId) } },
      select: { id: true, name: true, strength: true, defaultUnit: true, sellCurrency: true },
    });
    const byId = Object.fromEntries(products.map((p) => [p.id, p]));

    const rows = grouped
      .map((g) => {
        const revenue = g._sum.lineTotal || 0;
        const cost = g._sum.procurementTotal || 0;
        return {
          product: byId[g.productId] || null,
          lineCount: g._count.id,
          quantity: g._sum.quantity || 0,
          revenue,
          costInr: cost,
        };
      })
      .filter((r) => r.product)
      .sort((a, b) => b.revenue - a.revenue);

    // Lines that never got linked, so the totals above can be read honestly.
    const unlinked = await prisma.salesOrderItem.count({ where: { productId: null } });
    res.json({ data: rows, unlinkedLines: unlinked });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * Products the lead data suggests you should add.
 *
 * The catalogue starts empty while thousands of leads already name what they
 * asked for. This surfaces the most-requested strings that are not in the
 * catalogue yet, so it can be built from real demand rather than memory.
 */
router.get('/products/suggestions', requireRole('agent'), async (_req, res) => {
  try {
    const leads = await prisma.lead.findMany({
      where: { product: { not: null } },
      select: { product: true },
      take: 20000,
    });
    const counts = new Map();
    for (const l of leads) {
      const name = String(l.product || '').trim();
      if (name.length < 3) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    const existing = new Set(
      (await prisma.product.findMany({ select: { name: true } })).map((p) => p.name.toLowerCase()),
    );
    const data = [...counts.entries()]
      .filter(([name]) => !existing.has(name.toLowerCase()))
      .map(([name, askedFor]) => ({ name, askedFor }))
      .sort((a, b) => b.askedFor - a.askedFor)
      .slice(0, 40);
    res.json({ data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/products/:id', requireRole('agent'), async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: toInt(req.params.id) },
      include: {
        supplier: { select: { id: true, name: true } },
        orderItems: {
          orderBy: { id: 'desc' },
          take: 20,
          include: {
            order: { select: { id: true, orderNumber: true, customerName: true, currency: true, createdAt: true, status: true } },
          },
        },
      },
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/products', requireRole('agent'), async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name?.trim()) return res.status(400).json({ error: 'name is required' });
    const product = await prisma.product.create({
      data: {
        tenantId: b.tenantId ?? 1,
        name: b.name.trim(),
        strength: b.strength?.trim() || null,
        packing: b.packing?.trim() || null,
        hsnCode: b.hsnCode?.trim() || null,
        sku: b.sku?.trim() || null,
        defaultUnit: b.defaultUnit?.trim() || 'box',
        sellPrice: toInt(b.sellPrice, null),
        sellCurrency: b.sellCurrency || 'USD',
        costInr: toInt(b.costInr, null),
        supplierId: b.supplierId ? toInt(b.supplierId) : null,
        active: b.active !== false,
        notes: b.notes || null,
      },
    });
    res.status(201).json(product);
  } catch (e) {
    if (e.code === 'P2002') {
      return res.status(409).json({ error: 'A product with that name and strength already exists' });
    }
    res.status(500).json({ error: e.message });
  }
});

router.patch('/products/:id', requireRole('agent'), async (req, res) => {
  try {
    const b = req.body || {};
    const data = {};
    for (const f of ['name', 'strength', 'packing', 'hsnCode', 'sku', 'defaultUnit', 'sellCurrency', 'notes']) {
      if (b[f] !== undefined) data[f] = b[f] === '' ? null : b[f];
    }
    for (const f of ['sellPrice', 'costInr']) {
      if (b[f] !== undefined) data[f] = toInt(b[f], null);
    }
    if (b.supplierId !== undefined) data.supplierId = b.supplierId ? toInt(b.supplierId) : null;
    if (b.active !== undefined) data.active = Boolean(b.active);
    // defaultUnit must not become null — a line needs a unit.
    if (data.defaultUnit === null) data.defaultUnit = 'box';
    res.json(await prisma.product.update({ where: { id: toInt(req.params.id) }, data }));
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Product not found' });
    if (e.code === 'P2002') return res.status(409).json({ error: 'A product with that name and strength already exists' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/products/:id', requireRole('manager'), async (req, res) => {
  try {
    const id = toInt(req.params.id);
    // Deactivate rather than delete where order lines reference it, so an old
    // invoice keeps pointing at what was actually sold.
    const used = await prisma.salesOrderItem.count({ where: { productId: id } });
    if (used > 0) {
      const row = await prisma.product.update({ where: { id }, data: { active: false } });
      return res.json({ deactivated: true, reason: `${used} order line(s) reference this product`, data: row });
    }
    await prisma.product.delete({ where: { id } });
    res.json({ success: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Product not found' });
    res.status(500).json({ error: e.message });
  }
});

export default router;
