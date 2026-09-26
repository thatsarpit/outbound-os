import express from 'express';
import prisma from '../utils/prismaClient.js';
import { requireRole } from '../auth/index.js';
import logger from '../utils/logger.js';
import orderNotifier from '../services/orderNotifier.js';
import { computeSettlement } from '../services/settlement.js';

/**
 * Sales: orders, customer invoices, shipments.
 *
 * Money is integer minor units throughout (paise/cents), matching the billing
 * models. Totals are always recomputed server-side from the line items — a
 * client-supplied total is treated as a display value, never as truth.
 *
 * Mount after auth middleware:
 *   app.use('/api', salesRoutes);
 */

const router = express.Router();

const ORDER_STATUSES = [
  'draft', 'confirmed', 'in_production', 'ready_to_ship', 'shipped', 'delivered', 'cancelled',
];
const INVOICE_STATUSES = ['draft', 'issued', 'paid', 'partially_paid', 'void'];
const SHIPMENT_STATUSES = [
  'pending', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'returned',
];

/** Carrier tracking URLs, so a shipment always has a working link. */
const CARRIER_URLS = {
  dhl: (n) => `https://www.dhl.com/en/express/tracking.html?AWB=${encodeURIComponent(n)}`,
  fedex: (n) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}`,
  ups: (n) => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}`,
  bluedart: (n) => `https://www.bluedart.com/tracking/${encodeURIComponent(n)}`,
  delhivery: (n) => `https://www.delhivery.com/track/package/${encodeURIComponent(n)}`,
  aramex: (n) => `https://www.aramex.com/track/results?ShipmentNumber=${encodeURIComponent(n)}`,
  india_post: (n) => `https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx?id=${encodeURIComponent(n)}`,
};

export function trackingUrlFor(carrier, trackingNumber) {
  if (!carrier || !trackingNumber) return null;
  const build = CARRIER_URLS[String(carrier).toLowerCase()];
  return build ? build(trackingNumber) : null;
}

const toInt = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
};

/** Recompute an order's money from its lines. Never trusts a client total. */
async function recalcOrder(tx, orderId) {
  const items = await tx.salesOrderItem.findMany({ where: { orderId } });
  const subtotal = items.reduce((sum, i) => sum + (i.lineTotal || 0), 0);
  // What the supplier charges, summed from the same lines. Kept on the order
  // so profit does not need a join every time it is read.
  const procurementCostInr = items.reduce((sum, i) => sum + (i.procurementTotal || 0), 0);

  const order = await tx.salesOrder.findUnique({
    where: { id: orderId },
    select: { discountTotal: true, taxTotal: true, feeMode: true, paymentMethodId: true },
  });
  const discount = order?.discountTotal || 0;
  const tax = order?.taxTotal || 0;

  // The fee is stored, not recomputed on read: changing a payment method's
  // rate later must not silently rewrite the economics of an order that has
  // already settled.
  let feeBps = 0;
  let feeFixed = 0;
  if (order?.paymentMethodId) {
    const pm = await tx.paymentMethod.findUnique({
      where: { id: order.paymentMethodId },
      select: { feeBps: true, feeFixed: true },
    });
    feeBps = pm?.feeBps || 0;
    feeFixed = pm?.feeFixed || 0;
  }
  const settled = computeSettlement({
    subtotal, discountTotal: discount, taxTotal: tax,
    feeBps, feeFixed, feeMode: order?.feeMode || 'absorb',
  });

  return tx.salesOrder.update({
    where: { id: orderId },
    data: {
      subtotal,
      procurementCostInr,
      feeAmount: settled.fee,
      // `total` is what the customer is invoiced, which differs from the goods
      // total once a fee is passed on.
      total: settled.invoiceTotal,
    },
  });
}

/**
 * Allocate the next sequential reference under a lock.
 *
 * Both order numbers and GST invoice numbers must be gapless per financial
 * year, so this reads the current maximum and writes inside the caller's
 * transaction rather than deriving anything from a timestamp.
 */
function fyPrefix(date = new Date()) {
  const y = date.getFullYear();
  // Indian financial year starts in April.
  const start = date.getMonth() >= 3 ? y : y - 1;
  return `${String(start).slice(2)}${String(start + 1).slice(2)}`;
}

async function nextNumber(tx, model, field, prefix) {
  const rows = await tx[model].findMany({
    where: { [field]: { startsWith: prefix } },
    select: { [field]: true },
    orderBy: { [field]: 'desc' },
    take: 1,
  });
  const last = rows[0]?.[field];
  const seq = last ? toInt(String(last).split('-').pop(), 0) : 0;
  return `${prefix}-${String(seq + 1).padStart(4, '0')}`;
}

// ── Orders ───────────────────────────────────────────────────────────────────

router.get('/orders', requireRole('agent'), async (req, res) => {
  try {
    const { status, search, page = 1, limit = 25, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const and = [];
    if (status && status !== 'all') and.push({ status });
    if (search) {
      and.push({
        OR: [
          { orderNumber: { contains: search } },
          { customerName: { contains: search } },
          { customerCompany: { contains: search } },
          { customerEmail: { contains: search } },
        ],
      });
    }
    const where = and.length ? { AND: and } : {};
    const allowedSort = ['createdAt', 'updatedAt', 'orderNumber', 'total', 'status', 'confirmedAt'];
    const take = Math.min(100, toInt(limit, 25));
    const skip = (Math.max(1, toInt(page, 1)) - 1) * take;

    const [orders, total] = await Promise.all([
      prisma.salesOrder.findMany({
        where,
        orderBy: { [allowedSort.includes(sortBy) ? sortBy : 'createdAt']: sortOrder === 'asc' ? 'asc' : 'desc' },
        skip,
        take,
        include: {
          items: { orderBy: { sortOrder: 'asc' } },
          invoices: { select: { id: true, number: true, status: true, total: true, amountPaid: true } },
          shipments: { select: { id: true, carrier: true, trackingNumber: true, trackingUrl: true, status: true, estimatedDelivery: true } },
          lead: { select: { id: true, name: true, company: true } },
        },
      }),
      prisma.salesOrder.count({ where }),
    ]);
    res.json({ data: orders, total, page: toInt(page, 1), pages: Math.ceil(total / take) || 1 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/orders/stats', requireRole('agent'), async (_req, res) => {
  try {
    const [byStatus, revenue, openShipments] = await Promise.all([
      prisma.salesOrder.groupBy({ by: ['status'], _count: { id: true }, _sum: { total: true } }),
      prisma.salesOrder.aggregate({
        where: { status: { notIn: ['draft', 'cancelled'] } },
        _sum: { total: true },
        _count: { id: true },
      }),
      prisma.shipment.count({ where: { status: { notIn: ['delivered', 'returned'] } } }),
    ]);
    res.json({
      byStatus,
      totalRevenue: revenue._sum.total || 0,
      orderCount: revenue._count.id || 0,
      openShipments,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/orders/:id', requireRole('agent'), async (req, res) => {
  try {
    const order = await prisma.salesOrder.findUnique({
      where: { id: toInt(req.params.id) },
      include: {
        items: { orderBy: { sortOrder: 'asc' }, include: { product: { select: { id: true, name: true, strength: true } } } },
        invoices: { orderBy: { createdAt: 'desc' } },
        shipments: { orderBy: { createdAt: 'desc' } },
        supplier: true,
        paymentMethod: true,
        lead: { select: { id: true, name: true, company: true, email: true, mobile: true, country: true, tags: true } },
      },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/orders', requireRole('agent'), async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.customerName?.trim()) {
      return res.status(400).json({ error: 'customerName is required' });
    }
    const items = Array.isArray(b.items) ? b.items : [];

    const order = await prisma.$transaction(async (tx) => {
      const orderNumber = await nextNumber(tx, 'salesOrder', 'orderNumber', `SO${fyPrefix()}`);
      const created = await tx.salesOrder.create({
        data: {
          tenantId: b.tenantId ?? 1,
          leadId: b.leadId ? toInt(b.leadId) : null,
          customerId: b.customerId ? toInt(b.customerId) : null,
          supplierId: b.supplierId ? toInt(b.supplierId) : null,
          paymentMethodId: b.paymentMethodId ? toInt(b.paymentMethodId) : null,
          feeMode: b.feeMode === 'pass_on' ? 'pass_on' : 'absorb',
          fxRateToInr: b.fxRateToInr ? toInt(b.fxRateToInr) : null,
          orderNumber,
          status: ORDER_STATUSES.includes(b.status) ? b.status : 'draft',
          customerName: b.customerName.trim(),
          customerCompany: b.customerCompany || null,
          customerEmail: b.customerEmail || null,
          customerPhone: b.customerPhone || null,
          country: b.country || null,
          billingAddress: b.billingAddress || null,
          shippingAddress: b.shippingAddress || null,
          currency: b.currency || 'USD',
          discountTotal: toInt(b.discountTotal, 0),
          taxTotal: toInt(b.taxTotal, 0),
          incoterms: b.incoterms || null,
          portOfDestination: b.portOfDestination || null,
          paymentTerms: b.paymentTerms || null,
          notes: b.notes || null,
          createdById: req.user?.sub ? toInt(req.user.sub) : null,
        },
      });
      for (const [i, item] of items.entries()) {
        const productId = item.productId ? toInt(item.productId) : null;
        // A catalogue entry supplies whatever the caller left out. It never
        // overrides a value that was sent: the deal's price wins over the
        // default, always.
        const product = productId
          ? await tx.product.findUnique({ where: { id: productId } })
          : null;

        const quantity = toInt(item.quantity, 1);
        const unitPrice = item.unitPrice !== undefined
          ? toInt(item.unitPrice, 0)
          : (product && product.sellCurrency === (b.currency || 'USD') ? product.sellPrice ?? 0 : 0);
        const procurementUnitCost = item.procurementUnitCost !== undefined
          ? toInt(item.procurementUnitCost, 0)
          : (product?.costInr ?? 0);

        await tx.salesOrderItem.create({
          data: {
            orderId: created.id,
            productId,
            // The name is copied onto the line so renaming a catalogue entry
            // never rewrites what an old invoice said.
            productName: String(item.productName || product?.name || 'Item'),
            strength: item.strength ?? product?.strength ?? null,
            packing: item.packing ?? product?.packing ?? null,
            hsnCode: item.hsnCode ?? product?.hsnCode ?? null,
            quantity,
            unit: item.unit || product?.defaultUnit || 'unit',
            unitPrice,
            lineTotal: quantity * unitPrice,
            procurementUnitCost,
            procurementTotal: quantity * procurementUnitCost,
            sortOrder: i,
          },
        });
      }
      await recalcOrder(tx, created.id);
      return tx.salesOrder.findUnique({
        where: { id: created.id },
        include: { items: { orderBy: { sortOrder: 'asc' } }, invoices: true, shipments: true },
      });
    });

    logger.info(`Sales order ${order.orderNumber} created for ${order.customerName}`);
    // Rollups are derived, so refresh rather than incrementing.
    if (order.customerId) await orderNotifier.refreshCustomerRollups(order.customerId).catch(() => {});
    res.status(201).json(order);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/orders/:id', requireRole('agent'), async (req, res) => {
  try {
    const id = toInt(req.params.id);
    const b = req.body || {};
    if (b.status && !ORDER_STATUSES.includes(b.status)) {
      return res.status(400).json({ error: `status must be one of: ${ORDER_STATUSES.join(', ')}` });
    }
    const data = {};
    for (const f of ['customerName', 'customerCompany', 'customerEmail', 'customerPhone', 'country',
      'billingAddress', 'shippingAddress', 'currency', 'incoterms', 'portOfDestination',
      'paymentTerms', 'notes']) {
      if (b[f] !== undefined) data[f] = b[f];
    }
    for (const f of ['discountTotal', 'taxTotal']) {
      if (b[f] !== undefined) data[f] = toInt(b[f], 0);
    }
    for (const f of ['supplierId', 'paymentMethodId']) {
      if (b[f] !== undefined) data[f] = b[f] ? toInt(b[f]) : null;
    }
    for (const f of ['fxRateToInr', 'amountReceivedInr']) {
      if (b[f] !== undefined) data[f] = b[f] === null || b[f] === '' ? null : toInt(b[f], 0);
    }
    if (b.feeMode !== undefined) data.feeMode = b.feeMode === 'pass_on' ? 'pass_on' : 'absorb';
    if (b.status) {
      data.status = b.status;
      if (b.status === 'confirmed') data.confirmedAt = new Date();
    }

    const order = await prisma.$transaction(async (tx) => {
      await tx.salesOrder.update({ where: { id }, data });
      // Discount/tax changes move the total, so recompute rather than trusting input.
      return recalcOrder(tx, id);
    });

    if (order.customerId) await orderNotifier.refreshCustomerRollups(order.customerId).catch(() => {});
    // Notifying is best-effort: a failed send must not fail the status change,
    // and OrderNotification's unique (orderId, event, channel) stops repeats.
    if (b.status === 'confirmed') {
      orderNotifier.notify(id, 'order_confirmed').catch(() => {});
    } else if (b.status === 'delivered') {
      orderNotifier.notify(id, 'order_delivered').catch(() => {});
    }
    res.json(order);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Order not found' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/orders/:id', requireRole('manager'), async (req, res) => {
  try {
    await prisma.salesOrder.delete({ where: { id: toInt(req.params.id) } });
    res.json({ success: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Order not found' });
    res.status(500).json({ error: e.message });
  }
});

// ── Line items ───────────────────────────────────────────────────────────────

router.post('/orders/:id/items', requireRole('agent'), async (req, res) => {
  try {
    const orderId = toInt(req.params.id);
    const b = req.body || {};
    const quantity = toInt(b.quantity, 1);
    const unitPrice = toInt(b.unitPrice, 0);
    const order = await prisma.$transaction(async (tx) => {
      const count = await tx.salesOrderItem.count({ where: { orderId } });
      const productId = b.productId ? toInt(b.productId) : null;
      const product = productId
        ? await tx.product.findUnique({ where: { id: productId } })
        : null;
      const procurementUnitCost = b.procurementUnitCost !== undefined
        ? toInt(b.procurementUnitCost, 0)
        : (product?.costInr ?? 0);

      await tx.salesOrderItem.create({
        data: {
          orderId,
          productId,
          productName: String(b.productName || product?.name || 'Item'),
          strength: b.strength ?? product?.strength ?? null,
          packing: b.packing ?? product?.packing ?? null,
          hsnCode: b.hsnCode ?? product?.hsnCode ?? null,
          quantity,
          unit: b.unit || product?.defaultUnit || 'unit',
          unitPrice,
          lineTotal: quantity * unitPrice,
          procurementUnitCost,
          procurementTotal: quantity * procurementUnitCost,
          sortOrder: count,
        },
      });
      return recalcOrder(tx, orderId);
    });
    res.status(201).json(order);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/order-items/:itemId', requireRole('agent'), async (req, res) => {
  try {
    const itemId = toInt(req.params.itemId);
    const b = req.body || {};
    const existing = await prisma.salesOrderItem.findUnique({ where: { id: itemId } });
    if (!existing) return res.status(404).json({ error: 'Line item not found' });

    const quantity = b.quantity !== undefined ? toInt(b.quantity, existing.quantity) : existing.quantity;
    const unitPrice = b.unitPrice !== undefined ? toInt(b.unitPrice, existing.unitPrice) : existing.unitPrice;
    const order = await prisma.$transaction(async (tx) => {
      const procurementUnitCost =
        b.procurementUnitCost !== undefined
          ? toInt(b.procurementUnitCost, existing.procurementUnitCost)
          : existing.procurementUnitCost;
      await tx.salesOrderItem.update({
        where: { id: itemId },
        data: {
          productId: b.productId !== undefined ? (b.productId ? toInt(b.productId) : null) : existing.productId,
          productName: b.productName ?? existing.productName,
          strength: b.strength ?? existing.strength,
          packing: b.packing ?? existing.packing,
          hsnCode: b.hsnCode ?? existing.hsnCode,
          unit: b.unit ?? existing.unit,
          quantity,
          unitPrice,
          lineTotal: quantity * unitPrice,
          procurementUnitCost,
          procurementTotal: quantity * procurementUnitCost,
        },
      });
      return recalcOrder(tx, existing.orderId);
    });
    res.json(order);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/order-items/:itemId', requireRole('agent'), async (req, res) => {
  try {
    const itemId = toInt(req.params.itemId);
    const existing = await prisma.salesOrderItem.findUnique({ where: { id: itemId } });
    if (!existing) return res.status(404).json({ error: 'Line item not found' });
    const order = await prisma.$transaction(async (tx) => {
      await tx.salesOrderItem.delete({ where: { id: itemId } });
      return recalcOrder(tx, existing.orderId);
    });
    res.json(order);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Invoices ─────────────────────────────────────────────────────────────────

router.post('/orders/:id/invoices', requireRole('agent'), async (req, res) => {
  try {
    const orderId = toInt(req.params.id);
    const b = req.body || {};
    const order = await prisma.salesOrder.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const invoice = await prisma.$transaction(async (tx) => {
      const number = await nextNumber(tx, 'salesInvoice', 'number', `INV${fyPrefix()}`);
      return tx.salesInvoice.create({
        data: {
          tenantId: order.tenantId,
          orderId,
          number,
          status: INVOICE_STATUSES.includes(b.status) ? b.status : 'draft',
          currency: order.currency,
          subtotal: order.subtotal,
          taxTotal: b.taxTotal !== undefined ? toInt(b.taxTotal, 0) : order.taxTotal,
          total: order.total,
          taxRate: b.taxRate !== undefined ? toInt(b.taxRate, 0) : null,
          placeOfSupply: b.placeOfSupply || null,
          dueAt: b.dueAt ? new Date(b.dueAt) : null,
          notes: b.notes || null,
        },
      });
    });
    res.status(201).json(invoice);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/invoices/:id', requireRole('agent'), async (req, res) => {
  try {
    const b = req.body || {};
    if (b.status && !INVOICE_STATUSES.includes(b.status)) {
      return res.status(400).json({ error: `status must be one of: ${INVOICE_STATUSES.join(', ')}` });
    }
    const data = {};
    if (b.status) {
      data.status = b.status;
      if (b.status === 'issued') data.issuedAt = new Date();
      if (b.status === 'paid') data.paidAt = new Date();
    }
    for (const f of ['amountPaid', 'taxTotal', 'taxRate']) {
      if (b[f] !== undefined) data[f] = toInt(b[f], 0);
    }
    for (const f of ['notes', 'placeOfSupply', 'pdfUrl']) {
      if (b[f] !== undefined) data[f] = b[f];
    }
    if (b.dueAt !== undefined) data.dueAt = b.dueAt ? new Date(b.dueAt) : null;

    const invoice = await prisma.salesInvoice.update({ where: { id: toInt(req.params.id) }, data });
    res.json(invoice);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Invoice not found' });
    res.status(500).json({ error: e.message });
  }
});

// ── Shipments ────────────────────────────────────────────────────────────────

router.post('/orders/:id/shipments', requireRole('agent'), async (req, res) => {
  try {
    const orderId = toInt(req.params.id);
    const b = req.body || {};
    const order = await prisma.salesOrder.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const carrier = b.carrier ? String(b.carrier).toLowerCase() : null;
    const shipment = await prisma.shipment.create({
      data: {
        tenantId: order.tenantId,
        orderId,
        carrier,
        trackingNumber: b.trackingNumber || null,
        trackingUrl: b.trackingUrl || trackingUrlFor(carrier, b.trackingNumber),
        status: SHIPMENT_STATUSES.includes(b.status) ? b.status : 'pending',
        shippedAt: b.shippedAt ? new Date(b.shippedAt) : null,
        estimatedDelivery: b.estimatedDelivery ? new Date(b.estimatedDelivery) : null,
        packageCount: b.packageCount !== undefined ? toInt(b.packageCount, 1) : null,
        weightGrams: b.weightGrams !== undefined ? toInt(b.weightGrams, 0) : null,
        notes: b.notes || null,
      },
    });

    // Recording a shipment is what "shipped" means; move the order with it so
    // the two cannot disagree.
    if (['draft', 'confirmed', 'in_production', 'ready_to_ship'].includes(order.status)) {
      await prisma.salesOrder.update({ where: { id: orderId }, data: { status: 'shipped' } });
    }
    // Only notify once a tracking number exists. A shipment is often recorded
    // before the carrier returns the number, and the notification is
    // idempotent per (order, event, channel) — firing it early would spend the
    // one send on a message with no tracking number in it, and the real one
    // could never go out. PATCH /shipments/:id fires it when the number lands.
    if (shipment.trackingNumber) {
      orderNotifier.notify(orderId, 'order_shipped', {
        carrier: shipment.carrier,
        trackingNumber: shipment.trackingNumber,
        trackingUrl: shipment.trackingUrl,
        estimatedDelivery: shipment.estimatedDelivery,
      }).catch(() => {});
    }
    res.status(201).json(shipment);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/shipments/:id', requireRole('agent'), async (req, res) => {
  try {
    const id = toInt(req.params.id);
    const b = req.body || {};
    if (b.status && !SHIPMENT_STATUSES.includes(b.status)) {
      return res.status(400).json({ error: `status must be one of: ${SHIPMENT_STATUSES.join(', ')}` });
    }
    const existing = await prisma.shipment.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Shipment not found' });

    const data = {};
    for (const f of ['trackingNumber', 'notes', 'lastStatusRaw']) {
      if (b[f] !== undefined) data[f] = b[f];
    }
    if (b.carrier !== undefined) data.carrier = b.carrier ? String(b.carrier).toLowerCase() : null;
    if (b.status) {
      data.status = b.status;
      if (b.status === 'delivered') data.deliveredAt = new Date();
    }
    for (const f of ['shippedAt', 'estimatedDelivery', 'deliveredAt']) {
      if (b[f] !== undefined) data[f] = b[f] ? new Date(b[f]) : null;
    }
    // Keep the link in step with whatever carrier/number now applies.
    const carrier = data.carrier ?? existing.carrier;
    const number = data.trackingNumber ?? existing.trackingNumber;
    data.trackingUrl = b.trackingUrl ?? trackingUrlFor(carrier, number) ?? existing.trackingUrl;

    const shipment = await prisma.shipment.update({ where: { id }, data });

    // The number arriving is the moment the customer can actually be told
    // something useful, so that is when the shipped notice goes out.
    if (!existing.trackingNumber && shipment.trackingNumber) {
      orderNotifier.notify(shipment.orderId, 'order_shipped', {
        carrier: shipment.carrier,
        trackingNumber: shipment.trackingNumber,
        trackingUrl: shipment.trackingUrl,
        estimatedDelivery: shipment.estimatedDelivery,
      }).catch(() => {});
    }

    if (shipment.status === 'delivered') {
      await prisma.salesOrder.update({
        where: { id: shipment.orderId },
        data: { status: 'delivered' },
      }).catch(() => {});
      orderNotifier.notify(shipment.orderId, 'order_delivered').catch(() => {});
    }
    res.json(shipment);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/shipments', requireRole('agent'), async (req, res) => {
  try {
    const { status } = req.query;
    const where = status && status !== 'all' ? { status } : {};
    const shipments = await prisma.shipment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        order: { select: { id: true, orderNumber: true, customerName: true, country: true } },
      },
    });
    res.json({ data: shipments, total: shipments.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/shipments/:id', requireRole('manager'), async (req, res) => {
  try {
    await prisma.shipment.delete({ where: { id: toInt(req.params.id) } });
    res.json({ success: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Shipment not found' });
    res.status(500).json({ error: e.message });
  }
});

export default router;
